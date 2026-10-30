import os
import sys
import json
import logging
from datetime import datetime
from dataclasses import asdict
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

EVENTS_LOG_FILE = "events.jsonl"

def get_event_log_path(storage_dir: str, tournament_id: Optional[str] = None) -> str:
    """Return file path for global or tournament-specific event log."""
    if tournament_id:
        t_dir = os.path.join(storage_dir, tournament_id)
        os.makedirs(t_dir, exist_ok=True)
        return os.path.join(t_dir, EVENTS_LOG_FILE)
    return os.path.join(storage_dir, EVENTS_LOG_FILE)

def record_event(
    storage_dir: str,
    action: str,
    payload: Dict[str, Any],
    actor: str = "system",
    tournament_id: Optional[str] = None,
    gcs_bucket = None
) -> Dict[str, Any]:
    """
    Append an immutable event record to the log.
    Writes to both the tournament-specific log (if tournament_id provided)
    and the central platform event journal.
    """
    event = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "actor": actor or "system",
        "action": action,
        "tournament_id": tournament_id,
        "payload": payload
    }
    line = json.dumps(event) + "\n"

    # 1. Append to central platform log
    central_path = get_event_log_path(storage_dir)
    os.makedirs(os.path.dirname(central_path) or ".", exist_ok=True)
    with open(central_path, "a", encoding="utf-8") as f:
        f.write(line)

    # 2. Append to tournament-specific log
    if tournament_id:
        t_path = get_event_log_path(storage_dir, tournament_id)
        with open(t_path, "a", encoding="utf-8") as f:
            f.write(line)

    # 3. GCS Persistence if bucket is provided
    if gcs_bucket:
        try:
            # Append to central log in GCS
            c_blob = gcs_bucket.blob(f"events/{EVENTS_LOG_FILE}")
            existing_c = c_blob.download_as_text() if c_blob.exists() else ""
            c_blob.upload_from_string(existing_c + line, content_type="application/x-ndjson")

            if tournament_id:
                t_blob = gcs_bucket.blob(f"tournaments/{tournament_id}/{EVENTS_LOG_FILE}")
                existing_t = t_blob.download_as_text() if t_blob.exists() else ""
                t_blob.upload_from_string(existing_t + line, content_type="application/x-ndjson")
        except Exception as e:
            logger.error(f"Error persisting event to GCS: {e}")

    return event

def load_events(log_path: str) -> List[Dict[str, Any]]:
    """Load events from a JSON Lines event log."""
    events = []
    if not os.path.exists(log_path):
        return events
    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return events

class ReplayEngine:
    """
    Deterministic state reconstruction engine.
    Processes sequential events to rebuild tournaments, profiles, and alias tables.
    """
    def __init__(self, target_storage_dir: str):
        self.storage_dir = target_storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)

    def _t_path(self, tournament_id: str) -> str:
        d = os.path.join(self.storage_dir, tournament_id)
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, "tournament.json")

    def _load_t(self, tournament_id: str) -> Optional[Dict]:
        p = self._t_path(tournament_id)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def _save_t(self, tournament_id: str, data: Dict):
        p = self._t_path(tournament_id)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _aliases_path(self) -> str:
        p_dir = os.path.join(self.storage_dir, "profiles")
        os.makedirs(p_dir, exist_ok=True)
        return os.path.join(p_dir, "aliases.json")

    def _load_aliases(self) -> Dict[str, str]:
        p = self._aliases_path()
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        alt = os.path.join(self.storage_dir, "aliases.json")
        if os.path.exists(alt):
            with open(alt, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    def _save_aliases(self, aliases: Dict[str, str]):
        with open(self._aliases_path(), "w", encoding="utf-8") as f:
            json.dump(aliases, f, indent=2)

    def _profile_path(self, email: str) -> str:
        sanitized = email.lower().replace("@", "_at_").replace(".", "_") + ".json"
        p_dir = os.path.join(self.storage_dir, "profiles")
        os.makedirs(p_dir, exist_ok=True)
        return os.path.join(p_dir, sanitized)

    def _load_profile(self, email: str) -> Dict:
        p = self._profile_path(email)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"email": email, "paradigm": "", "history": []}

    def _save_profile(self, email: str, profile: Dict):
        p = self._profile_path(email)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=2)

    def apply_event(self, event: Dict[str, Any]):
        action = event.get("action")
        tid = event.get("tournament_id")
        p = event.get("payload", {})
        actor = event.get("actor", "system")
        ts = event.get("timestamp")

        if action == "TOURNAMENT_INIT":
            rounds = p.get("rounds", 0)
            elim_rounds = p.get("elim_rounds", 0)
            data = {
                "config": {
                    "num_teams": p.get("num_teams", len(p.get("teams", []))),
                    "num_prelim_rounds": rounds,
                    "num_elim_rounds": elim_rounds,
                    "num_rounds": rounds + elim_rounds,
                },
                "status": p.get("status", "approved"),
                "requested_by": p.get("requested_by") or (actor if actor != "system" else None),
                "requested_at": p.get("requested_at") or ts,
                "approved_by": p.get("approved_by"),
                "approved_at": p.get("approved_at"),
                "current_round": 0,
                "rounds": [],
                "teams": p.get("teams", []),
                "judges": p.get("judges", []),
                "matches": [],
                "next_match_id": 1,
                "tournament_id": tid,
                "auth": p.get("auth", {
                    "admins": [actor] if actor and actor != "system" else [],
                    "judges": {},
                    "coaches": {},
                    "coach_requests": {}
                }),
                "team_requests": p.get("team_requests", {})
            }
            if p.get("judges"):
                data["next_judge_id"] = max([j.get("id", 0) for j in p.get("judges", [])], default=0) + 1
            self._save_t(tid, data)

        elif action == "TOURNAMENT_APPROVED":
            data = self._load_t(tid)
            if data:
                data["status"] = "approved"
                data["approved_by"] = actor
                data["approved_at"] = ts
                self._save_t(tid, data)

        elif action in ("TOURNAMENT_REJECTED", "TOURNAMENT_RESET"):
            path = self._t_path(tid)
            if os.path.exists(path):
                os.remove(path)

        elif action == "COACH_REQUESTED":
            data = self._load_t(tid)
            if data:
                if "auth" not in data:
                    data["auth"] = {"admins": [], "judges": {}, "coaches": {}, "coach_requests": {}}
                if "coach_requests" not in data["auth"]:
                    data["auth"]["coach_requests"] = {}
                email = p.get("email", actor).lower()
                data["auth"]["coach_requests"][email] = {
                    "email": email,
                    "name": p.get("name", email),
                    "institution": p.get("institution", ""),
                    "requested_at": ts
                }
                self._save_t(tid, data)

        elif action == "COACH_APPROVED":
            data = self._load_t(tid)
            if data:
                email = p.get("email", "").lower()
                inst = p.get("institution", "")
                if "auth" not in data:
                    data["auth"] = {"admins": [], "judges": {}, "coaches": {}, "coach_requests": {}}
                if "coaches" not in data["auth"]:
                    data["auth"]["coaches"] = {}
                data["auth"]["coaches"][email] = inst
                if "coach_requests" in data["auth"] and email in data["auth"]["coach_requests"]:
                    del data["auth"]["coach_requests"][email]
                self._save_t(tid, data)

        elif action == "COACH_REJECTED":
            data = self._load_t(tid)
            if data:
                email = p.get("email", "").lower()
                if "auth" in data and "coach_requests" in data["auth"] and email in data["auth"]["coach_requests"]:
                    del data["auth"]["coach_requests"][email]
                self._save_t(tid, data)

        elif action == "COACH_ADDED":
            data = self._load_t(tid)
            if data:
                email = p.get("email", "").lower()
                inst = p.get("institution", "")
                if "auth" not in data:
                    data["auth"] = {"admins": [], "judges": {}, "coaches": {}}
                if "coaches" not in data["auth"]:
                    data["auth"]["coaches"] = {}
                data["auth"]["coaches"][email] = inst
                self._save_t(tid, data)

        elif action == "COACH_REMOVED":
            data = self._load_t(tid)
            if data:
                email = p.get("email", "").lower()
                if "auth" in data and "coaches" in data["auth"] and email in data["auth"]["coaches"]:
                    del data["auth"]["coaches"][email]
                self._save_t(tid, data)

        elif action == "TEAM_REQUESTED":
            data = self._load_t(tid)
            if data:
                if "team_requests" not in data:
                    data["team_requests"] = {}
                req_id = p.get("id") or f"tr_{len(data['team_requests'])+1}"
                data["team_requests"][req_id] = p
                self._save_t(tid, data)

        elif action == "TEAM_APPROVED":
            data = self._load_t(tid)
            if data:
                req_id = p.get("request_id")
                if "team_requests" in data and req_id in data["team_requests"]:
                    del data["team_requests"][req_id]
                new_team = p.get("team") or {
                    "id": p.get("team_id", len(data.get("teams", []))),
                    "name": p.get("name", "Team"),
                    "institution": p.get("institution", "Unknown"),
                    "members": p.get("members", [])
                }
                data.setdefault("teams", []).append(new_team)
                data.setdefault("config", {})["num_teams"] = len(data["teams"])
                self._save_t(tid, data)

        elif action == "TEAM_REJECTED":
            data = self._load_t(tid)
            if data:
                req_id = p.get("request_id")
                if "team_requests" in data and req_id in data["team_requests"]:
                    del data["team_requests"][req_id]
                self._save_t(tid, data)

        elif action == "TEAM_REGISTERED":
            data = self._load_t(tid)
            if data:
                team_data = p.get("team", p)
                team_id = team_data.get("id")
                teams = data.setdefault("teams", [])
                existing = next((t for t in teams if t.get("id") == team_id), None)
                if existing:
                    existing.update(team_data)
                else:
                    teams.append(team_data)
                data["config"]["num_teams"] = len(teams)
                self._save_t(tid, data)

        elif action == "JUDGE_ADDED":
            data = self._load_t(tid)
            if data:
                judge = p.get("judge", p)
                data.setdefault("judges", []).append(judge)
                data["next_judge_id"] = max([j.get("id", 0) for j in data["judges"]], default=0) + 1
                if judge.get("email"):
                    data.setdefault("auth", {}).setdefault("judges", {})[str(judge.get("id"))] = judge["email"]
                self._save_t(tid, data)

        elif action == "JUDGE_REMOVED":
            data = self._load_t(tid)
            if data:
                jid = p.get("judge_id")
                data["judges"] = [j for j in data.get("judges", []) if j.get("id") != jid]
                if "auth" in data and "judges" in data["auth"] and str(jid) in data["auth"]["judges"]:
                    del data["auth"]["judges"][str(jid)]
                self._save_t(tid, data)

        elif action == "JUDGE_ASSIGNED":
            data = self._load_t(tid)
            if data:
                mid = p.get("match_id")
                jid = p.get("judge_id")
                for m in data.get("matches", []):
                    if m.get("match_id") == mid:
                        m["judge_id"] = jid
                for j in data.get("judges", []):
                    j.setdefault("matches_judged", [])
                    if j.get("id") == jid and mid not in j["matches_judged"]:
                        j["matches_judged"].append(mid)
                    elif j.get("id") != jid and mid in j["matches_judged"]:
                        j["matches_judged"].remove(mid)
                self._save_t(tid, data)

        elif action == "ROUND_PAIRED":
            data = self._load_t(tid)
            if data:
                round_num = p.get("round_num", data.get("current_round", 0) + 1)
                data["current_round"] = round_num
                new_matches = p.get("matches", [])
                data.setdefault("matches", []).extend(new_matches)
                data.setdefault("rounds", []).append([m.get("match_id") for m in new_matches])
                data["next_match_id"] = max([m.get("match_id", 0) for m in data.get("matches", [])], default=0) + 1
                self._save_t(tid, data)

        elif action == "BALLOT_REPORTED":
            data = self._load_t(tid)
            if data:
                mid = p.get("match_id")
                res = p.get("result")
                judge_id = p.get("judge_id")
                speaker_points = p.get("speaker_points")
                for m in data.get("matches", []):
                    if m.get("match_id") == mid:
                        m["outcome"] = res
                        m["result"] = res
                        if judge_id is not None:
                            m["judge_id"] = judge_id
                        if speaker_points:
                            m["speaker_points"] = speaker_points
                # Recalculate stats deterministically
                try:
                    import tournament_manager as tm
                    data, teams = tm._reconstruct_teams(data)
                    team_map = {t.id: t for t in teams}
                    tm.recalculate_stats(data, teams, team_map)
                    data['teams'] = [asdict(t) for t in teams]
                except Exception as e:
                    logger.warning(f"Stats recalculation skipped in replay: {e}")
                self._save_t(tid, data)

        elif action == "TOURNAMENT_CLOSED":
            data = self._load_t(tid)
            if data:
                data["is_closed"] = True
                matches = data.get("matches", [])
                judges_dict = {j.get("id"): j for j in data.get("judges", [])}
                for m in matches:
                    jid = m.get("judge_id")
                    res = m.get("result")
                    if jid and res and jid in judges_dict:
                        j = judges_dict[jid]
                        email = j.get("email")
                        if email:
                            email = email.lower()
                            prof = self._load_profile(email)
                            record = {
                                "tournament_id": tid,
                                "tournament_name": data.get("tournamentId", tid),
                                "match_id": m.get("match_id"),
                                "round_num": m.get("round_num"),
                                "aff_team": m.get("aff_name"),
                                "neg_team": m.get("neg_name"),
                                "result": res,
                                "date": ts or datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                            }
                            prof.setdefault("history", [])
                            existing = next((h for h in prof["history"] if h.get("tournament_id") == tid and h.get("match_id") == m.get("match_id")), None)
                            if existing:
                                existing.update(record)
                            else:
                                prof["history"].append(record)
                            self._save_profile(email, prof)

                # Reconstruct debater histories
                for team in data.get("teams", []):
                    team_id = team.get("id")
                    team_name = team.get("name", "Unknown")
                    institution = team.get("institution", "Unknown")
                    t_matches = [m for m in matches if (m.get("aff_id") == team_id or m.get("neg_id") == team_id) and m.get("result")]
                    if not t_matches:
                        continue
                    for member in team.get("members", []):
                        m_email = member.get("email")
                        if not m_email:
                            continue
                        m_email = m_email.lower()
                        prof = self._load_profile(m_email)
                        prof.setdefault("history", [])
                        prof["history"] = [r for r in prof["history"] if not (r.get("tournament_id") == tid and r.get("type") == "participation")]
                        for m in t_matches:
                            is_aff = m.get("aff_id") == team_id
                            raw_res = m.get("result")
                            if raw_res == "A":
                                res_str = "Win" if is_aff else "Loss"
                            elif raw_res == "N":
                                res_str = "Win" if not is_aff else "Loss"
                            else:
                                res_str = "Pending"
                            prof["history"].append({
                                "type": "participation",
                                "tournament_id": tid,
                                "tournament_name": data.get("tournamentId", tid),
                                "match_id": m.get("match_id"),
                                "round_num": m.get("round_num"),
                                "side": "Aff" if is_aff else "Neg",
                                "opponent": m.get("neg_name") if is_aff else m.get("aff_name"),
                                "team_name": team_name,
                                "institution": institution,
                                "result": res_str,
                                "date": ts or datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                            })
                        self._save_profile(m_email, prof)

                self._save_t(tid, data)

        elif action == "EMAIL_LINKED":
            primary = p.get("primary_email", "").lower().strip()
            secondary = p.get("secondary_email", "").lower().strip()
            if primary and secondary:
                aliases = self._load_aliases()
                aliases[secondary] = primary
                self._save_aliases(aliases)
                # Update primary profile
                prof = self._load_profile(primary)
                prof.setdefault("aliases", [])
                if secondary not in prof["aliases"]:
                    prof["aliases"].append(secondary)
                self._save_profile(primary, prof)

        elif action == "PARADIGM_UPDATED":
            email = p.get("email", "").lower().strip()
            paradigm = p.get("paradigm", "")
            if email:
                prof = self._load_profile(email)
                prof["paradigm"] = paradigm
                self._save_profile(email, prof)

    def replay_all(self, events: List[Dict[str, Any]]):
        """Replay an entire list of events in order."""
        for event in events:
            self.apply_event(event)

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Central Event Journal & State Replay CLI")
    parser.add_argument("--replay", type=str, help="Path to events.jsonl to replay")
    parser.add_argument("--target", type=str, default="replay_output", help="Target directory for replayed state")
    parser.add_argument("--tournament", type=str, help="Optional: Replay events for specific tournament only")
    parser.add_argument("--verify", action="store_true", help="Verify replay state matches current storage directory")
    parser.add_argument("--storage", type=str, default="local_storage", help="Current storage directory (for verify)")
    args = parser.parse_args()

    if args.verify:
        log_path = get_event_log_path(args.storage)
        if not os.path.exists(log_path):
            print(f"No central event log found at {log_path}")
            sys.exit(1)
        events = load_events(log_path)
        print(f"Loaded {len(events)} events from {log_path}")
        
        import tempfile
        import shutil
        temp_dir = tempfile.mkdtemp(prefix="replay_verify_")
        try:
            engine = ReplayEngine(temp_dir)
            engine.replay_all(events)
            print(f"Replayed {len(events)} events to temporary directory {temp_dir}")
            
            mismatches = 0
            for item in os.listdir(args.storage):
                orig_t_file = os.path.join(args.storage, item, "tournament.json")
                if os.path.isfile(orig_t_file):
                    rep_t_file = os.path.join(temp_dir, item, "tournament.json")
                    if not os.path.exists(rep_t_file):
                        print(f"MISMATCH: Tournament {item} missing from replay!")
                        mismatches += 1
                        continue
                    with open(orig_t_file, "r") as f1, open(rep_t_file, "r") as f2:
                        d1 = json.load(f1)
                        d2 = json.load(f2)
                    if d1 == d2:
                        print(f"MATCH: Tournament {item} state perfectly reconstructed.")
                    else:
                        print(f"DIFF: Tournament {item} has differences between live and replay.")
                        mismatches += 1

            # Verify aliases if present
            orig_aliases = os.path.join(args.storage, "profiles", "aliases.json")
            if not os.path.exists(orig_aliases):
                orig_aliases = os.path.join(args.storage, "aliases.json")
            if os.path.exists(orig_aliases):
                with open(orig_aliases) as f:
                    a1 = json.load(f)
                rep_aliases = os.path.join(temp_dir, "profiles", "aliases.json")
                if not os.path.exists(rep_aliases):
                    rep_aliases = os.path.join(temp_dir, "aliases.json")
                a2 = {}
                if os.path.exists(rep_aliases):
                    with open(rep_aliases) as f:
                        a2 = json.load(f)
                if a1 == a2:
                    print("MATCH: Email aliases perfectly reconstructed.")
                else:
                    print("DIFF: Email aliases difference detected.")
                    mismatches += 1

            if mismatches == 0:
                print("SUCCESS: 100% Deterministic State Replay Verified!")
                sys.exit(0)
            else:
                print(f"FAILURE: {mismatches} mismatches detected.")
                sys.exit(1)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    elif args.replay:
        if not os.path.exists(args.replay):
            print(f"File not found: {args.replay}")
            sys.exit(1)
        events = load_events(args.replay)
        if args.tournament:
            events = [e for e in events if e.get("tournament_id") == args.tournament]
        print(f"Replaying {len(events)} events to {args.target}...")
        engine = ReplayEngine(args.target)
        engine.replay_all(events)
        print(f"Replay complete into {args.target}")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
