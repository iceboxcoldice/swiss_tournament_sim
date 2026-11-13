import logging
import os
from dataclasses import asdict
from datetime import datetime

from flask import Blueprint, jsonify, request

import auth
import config
import storage
import swiss_sim
import tournament_manager as tm

logger = logging.getLogger(__name__)

bp = Blueprint('tournaments', __name__)


def _build_round_matches(data, pairs, round_num):
    """Build match dicts for a paired round and advance next_match_id."""
    new_matches = []
    next_match_id = data.get('next_match_id', 1)

    for p in pairs:
        if len(p) == 1 or p[1] is None:
            m = {
                "match_id": next_match_id,
                "round_num": round_num,
                "aff_id": p[0].id,
                "neg_id": -1,
                "aff_name": p[0].name,
                "neg_name": "BYE",
                "result": "A",
                "judge_id": -1,
                "speaker_points": None,
                "is_bye": True,
            }
        else:
            m = {
                "match_id": next_match_id,
                "round_num": round_num,
                "aff_id": p[0].id,
                "neg_id": p[1].id,
                "aff_name": p[0].name,
                "neg_name": p[1].name,
                "result": None,
                "judge_id": -1,
                "speaker_points": None,
            }
        new_matches.append(m)
        next_match_id += 1

    data.setdefault('matches', []).extend(new_matches)
    data.setdefault('rounds', []).append([m['match_id'] for m in new_matches])
    data['next_match_id'] = next_match_id
    data['current_round'] = round_num
    return new_matches


@bp.route('/api/tournaments', methods=['GET'])
def list_tournaments():
    """List all available tournaments by scanning GCS buckets or local storage."""
    try:
        tournament_ids = []
        bucket_name = config.get_setting('BUCKET_NAME')
        local_dir = config.get_setting('LOCAL_STORAGE_DIR')
        default_id = config.get_setting('DEFAULT_TOURNAMENT_ID')

        if bucket_name:
            client = storage.get_storage_client()
            blobs = client.list_blobs(bucket_name, prefix="tournaments/", delimiter="/")
            list(blobs)
            for p in blobs.prefixes:
                tournament_ids.append(p.split('/')[-2])
        else:
            if os.path.exists(local_dir):
                for t_id in os.listdir(local_dir):
                    t_dir = os.path.join(local_dir, t_id)
                    t_file = os.path.join(t_dir, 'tournament.json')
                    if os.path.isdir(t_dir) and os.path.exists(t_file):
                        tournament_ids.append(t_id)

        if not tournament_ids and storage.load_tournament_from_gcs(default_id):
            tournament_ids = [default_id]

        tournaments_data = []
        for t_id in tournament_ids:
            data, _ = storage.patched_load_tournament_with_id(t_id)
            admins = []
            is_closed = False
            status = 'approved'
            requested_by = None
            if data:
                is_closed = data.get('is_closed', False)
                status = data.get('status', 'approved')
                requested_by = data.get('requested_by')
                if 'auth' in data and 'admins' in data['auth']:
                    admins = data['auth']['admins']
            tournaments_data.append({
                "id": t_id,
                "admins": admins,
                "is_closed": is_closed,
                "status": status,
                "requested_by": requested_by,
            })

        return jsonify({"tournaments": tournaments_data}), 200
    except Exception as e:
        logger.error(f"Error listing tournaments: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/init', methods=['POST'])
@auth.require_auth()
def init_tournament(tournament_id):
    """Initialize a new tournament. Supports 0 teams for open registration."""
    try:
        req_data = request.json or {}
        num_teams = req_data.get('num_teams', 0)
        rounds = req_data.get('rounds')
        elim_rounds = req_data.get('elim_rounds', 0)

        if rounds is None or rounds < 1:
            return jsonify({"error": "Missing or invalid rounds (must be >= 1)"}), 400

        req_teams = req_data.get('teams', [])
        teams = []
        if req_teams:
            for i, req_t in enumerate(req_teams):
                name = req_t.get('name', f"Team {i+1}")
                institution = req_t.get('institution', 'Unknown')
                members = req_t.get('members', [])
                t_obj = swiss_sim.Team(id=i, true_rank=0, name=name, members=members)
                t_obj.institution = institution
                teams.append(t_obj)
        elif num_teams and num_teams > 0:
            for i in range(num_teams):
                t_obj = swiss_sim.Team(id=i, true_rank=0, name=f"Team {i+1}", members=[])
                t_obj.institution = "Unknown"
                teams.append(t_obj)

        user_info = getattr(request, 'user_info', None)
        logger.info(f"init_tournament: user_info identified as: {user_info}")
        user_email = user_info.get('email', '').lower().strip() if user_info else ''
        user_name = user_info.get('name', '') if user_info else ''

        client_id = config.get_setting('GOOGLE_OAUTH_CLIENT_ID')
        require_approval = config.get_setting('REQUIRE_USER_APPROVAL')
        testing_mode = config.get_setting('TESTING_MODE')

        if (require_approval or testing_mode) and client_id and not auth.is_user_approved(user_email):
            entry = auth.get_or_create_user_registration(user_email, user_name)
            current_status = entry.get('status', 'pending')
            if current_status == 'rejected':
                return jsonify({"error": "Forbidden: Your user registration was rejected by Super Admin."}), 403
            return jsonify({
                "error": "Forbidden: User registration requires explicit Super Admin approval during testing mode before creating tournament requests.",
                "registration_status": current_status,
            }), 403

        auto_approve = not client_id or auth.is_super_admin(user_email)
        status = 'approved' if auto_approve else 'pending'

        pairing_scheme = req_data.get('pairing_scheme', 'high-low')
        actual_num_teams = len(teams)
        data = {
            "config": {
                "num_teams": actual_num_teams,
                "num_prelim_rounds": rounds,
                "num_elim_rounds": elim_rounds,
                "num_rounds": rounds + elim_rounds,
                "pairing_scheme": pairing_scheme,
            },
            "status": status,
            "is_started": False,
            "requested_by": user_email if user_email else None,
            "requested_at": datetime.utcnow().isoformat(),
            "approved_by": user_email if auto_approve and user_email else None,
            "approved_at": datetime.utcnow().isoformat() if auto_approve else None,
            "current_round": 0,
            "rounds": [],
            "teams": [asdict(t) for t in teams],
            "judges": [],
            "matches": [],
            "next_match_id": 1,
            "tournament_id": tournament_id,
            "auth": {
                "admins": [user_email] if user_email else [],
                "judges": {},
                "coaches": {},
                "coach_requests": {},
                "judge_requests": {},
            },
            "team_requests": {},
        }

        if storage.save_tournament_to_gcs(data, tournament_id):
            logger.info(f"Tournament {tournament_id} initialized with status {status} and {actual_num_teams} teams")
            storage.log_event(
                action="TOURNAMENT_INIT",
                payload={
                    "num_teams": actual_num_teams,
                    "rounds": rounds,
                    "elim_rounds": elim_rounds,
                    "status": status,
                    "requested_by": data.get("requested_by"),
                    "requested_at": data.get("requested_at"),
                    "approved_by": data.get("approved_by"),
                    "approved_at": data.get("approved_at"),
                    "teams": data.get("teams", []),
                    "judges": data.get("judges", []),
                    "auth": data.get("auth", {}),
                    "team_requests": data.get("team_requests", {}),
                },
                tournament_id=tournament_id,
                actor=user_email or 'system',
            )
            msg = "Tournament initialized" if auto_approve else "Tournament creation request submitted and pending super admin approval"
            return jsonify({"message": msg, "status": status, "config": data['config']}), 200

        logger.error(f"Failed to save tournament {tournament_id} to GCS during init")
        return jsonify({"error": "Failed to save tournament data"}), 500
    except Exception as e:
        logger.error(f"Error in init for {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/data', methods=['GET'])
def get_data(tournament_id):
    """Get full tournament data (for syncing)."""
    logger.info(f"Data sync requested for {tournament_id}")
    data = storage.load_tournament_from_gcs(tournament_id)
    if data:
        logger.info(f"Tournament data for {tournament_id} found and returned")
        response = jsonify(data)
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response, 200
    logger.warning(f"No tournament data found for {tournament_id} in GCS")
    return jsonify({"error": "No tournament found"}), 404


@bp.route('/api/t/<tournament_id>/pair', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def pair_round(tournament_id):
    """Pair the next round."""
    try:
        req_data = request.json or {}
        round_num = req_data.get('round')
        pairing_scheme = req_data.get('pairing_scheme')

        if not round_num:
            return jsonify({"error": "Missing round number"}), 400

        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "No tournament found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and finalized"}), 403

        if round_num == 1:
            if len(teams) < 2:
                return jsonify({"error": f"Cannot pair Round 1: At least 2 teams required to start tournament (currently registered: {len(teams)})"}), 400
            data['is_started'] = True

        try:
            pairs = tm.pair_round_logic(data, teams, round_num, pairing_scheme=pairing_scheme)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        new_matches = _build_round_matches(data, pairs, round_num)
        data['is_started'] = True

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            effective_scheme = pairing_scheme or data.get('config', {}).get('pairing_scheme', 'high-low')
            storage.log_event(
                action="ROUND_PAIRED",
                payload={"round_num": round_num, "matches": new_matches, "pairing_scheme": effective_scheme},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": f"Round {round_num} paired", "matches": new_matches}), 200
        return jsonify({"error": "Failed to save pairings"}), 500
    except Exception as e:
        logger.error(f"Error in pair: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/start', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def start_tournament_endpoint(tournament_id):
    """Admin starts the tournament, closing registration and optionally pairing Round 1."""
    try:
        data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Tournament is closed"}), 403
        if data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0):
            return jsonify({"error": "Tournament has already been started"}), 400
        if len(teams_objs) < 2:
            return jsonify({"error": f"Cannot start tournament: At least 2 teams required to start (currently registered: {len(teams_objs)})"}), 400

        data['is_started'] = True
        req = request.json or {}
        pair_r1 = req.get('pair_round_1', True)
        new_matches = []

        if pair_r1:
            try:
                pairs = tm.pair_round_logic(data, teams_objs, 1)
                new_matches = _build_round_matches(data, pairs, 1)
            except Exception as e:
                return jsonify({"error": f"Error pairing Round 1: {str(e)}"}), 400

        if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
            storage.log_event(
                action="TOURNAMENT_STARTED",
                payload={"started_at": datetime.utcnow().isoformat(), "num_teams": len(teams_objs), "matches": new_matches},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({
                "message": f"Tournament started with {len(teams_objs)} teams. Registration is now closed.",
                "is_started": True,
                "matches": new_matches,
            }), 200
        return jsonify({"error": "Failed to save tournament state"}), 500
    except Exception as e:
        logger.error(f"Error starting tournament {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/report', methods=['POST'])
@auth.require_auth(allowed_roles=['admin', 'judge'])
def report_result(tournament_id):
    """Report a match result."""
    try:
        req_data = request.json
        match_id = req_data.get('match_id')
        result = req_data.get('result')
        judge_id = req_data.get('judge_id')
        speaker_points = req_data.get('speaker_points')
        rfd = req_data.get('rfd', '').strip()
        comments = req_data.get('comments', {})

        if not match_id:
            return jsonify({"error": "Missing match_id"}), 400

        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "No tournament found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and results are finalized"}), 403

        match = next((m for m in data['matches'] if m['match_id'] == match_id), None)
        if not match:
            return jsonify({"error": f"Match {match_id} not found"}), 404

        user_info = getattr(request, 'user_info', None)
        effective_judge_id = judge_id
        if user_info and config.get_setting('GOOGLE_OAUTH_CLIENT_ID'):
            user_email = user_info.get('email')
            auth_data = data.get('auth', {})
            is_admin = user_email in auth_data.get('admins', [])
            if not is_admin:
                my_judge_id = None
                for j_idx, j_email in auth_data.get('judges', {}).items():
                    if j_email == user_email:
                        my_judge_id = int(j_idx)
                        break
                panel_judges = match.get('panel') or ([match.get('judge_id')] if match.get('judge_id') is not None else [])
                if my_judge_id is None or my_judge_id not in panel_judges:
                    return jsonify({"error": "Forbidden: You are not assigned to this match"}), 403
                effective_judge_id = my_judge_id

        ballots = match.setdefault('ballots', {})
        if effective_judge_id is not None:
            ballots[str(effective_judge_id)] = {
                "judge_id": effective_judge_id,
                "vote": result,
                "speaker_points": speaker_points or {},
                "rfd": rfd,
                "comments": comments,
            }

        if rfd:
            match['rfd'] = rfd
        if comments:
            match['comments'] = comments
        if speaker_points:
            match['speaker_points'] = speaker_points
        if effective_judge_id is not None and not match.get('judge_id'):
            match['judge_id'] = effective_judge_id

        panel = match.get('panel') or []
        if len(panel) > 1 and effective_judge_id is not None:
            votes = [b.get('vote') for b in ballots.values() if b.get('vote') in ('A', 'N')]
            aff_votes = votes.count('A')
            neg_votes = votes.count('N')
            panel_size = len(panel)
            majority = (panel_size // 2) + 1

            if aff_votes >= majority:
                match['result'] = 'A'
                match['outcome'] = 'A'
            elif neg_votes >= majority:
                match['result'] = 'N'
                match['outcome'] = 'N'

            if aff_votes >= majority or neg_votes >= majority or len(votes) >= panel_size:
                match['decision'] = f"{max(aff_votes, neg_votes)}-{min(aff_votes, neg_votes)}"
        else:
            match['result'] = result
            match['outcome'] = result
            match['decision'] = "1-0"

        team_map = {t.id: t for t in teams}
        tm.recalculate_stats(data, teams, team_map)

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action="BALLOT_REPORTED",
                payload={
                    "match_id": match_id,
                    "result": match['result'],
                    "vote": result,
                    "judge_id": effective_judge_id,
                    "speaker_points": speaker_points,
                    "rfd": rfd,
                    "comments": comments,
                    "decision": match.get('decision'),
                },
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({
                "message": f"Reported ballot for Match {match_id}",
                "result": match['result'],
                "decision": match.get('decision'),
            }), 200
        return jsonify({"error": "Failed to save result"}), 500
    except Exception as e:
        logger.error(f"Error in report: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/reset', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def reset_tournament(tournament_id):
    """Clear tournament data from storage (GCS or Local) for a specific tournament."""
    logger.info(f"Tournament reset requested for {tournament_id} via /api/t/id/reset")
    try:
        data, _ = storage.patched_load_tournament_with_id(tournament_id)
        if data and data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and cannot be reset"}), 403

        path = storage.get_blob_path(tournament_id)
        bucket_name = config.get_setting('BUCKET_NAME')

        if bucket_name:
            client = storage.get_storage_client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(path)
            if blob.exists():
                blob.delete()
                logger.info(f"Tournament {tournament_id} data SUCCESSFULLY deleted from GCS")
                storage.log_event(
                    action="TOURNAMENT_RESET",
                    payload={"reset": True},
                    tournament_id=tournament_id,
                    actor=auth.get_current_actor(),
                )
                return jsonify({"message": f"Tournament {tournament_id} data cleared"}), 200
            logger.warning(f"Tournament data blob NOT FOUND for {tournament_id} during reset request")
            return jsonify({"message": "No tournament data found to clear"}), 200

        if os.path.exists(path):
            os.remove(path)
            t_dir = os.path.dirname(path)
            try:
                os.rmdir(t_dir)
            except OSError:
                pass
            logger.info(f"Tournament {tournament_id} data SUCCESSFULLY deleted from Local Storage")
            storage.log_event(
                action="TOURNAMENT_RESET",
                payload={"reset": True},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": f"Tournament {tournament_id} data cleared"}), 200

        logger.warning(f"Tournament data file NOT FOUND for {tournament_id} during local reset request")
        return jsonify({"message": "No tournament data found to clear"}), 200
    except Exception as e:
        logger.error(f"Error in reset for {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/close', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def close_tournament_endpoint(tournament_id):
    """Finalize tournament and commit all judge histories."""
    try:
        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Tournament is already closed"}), 400

        judges_data = data.get('judges', [])
        matches = data.get('matches', [])
        updated_count = 0
        judges_dict = {j.get('id'): j for j in judges_data}
        judge_history_commits = {}

        for m in matches:
            judge_id = m.get('judge_id')
            if not judge_id or not m.get('result'):
                continue
            judge = judges_dict.get(judge_id)
            if not judge or not judge.get('email'):
                continue
            email = judge.get('email').lower()
            judge_history_commits.setdefault(email, []).append({
                "tournament_id": tournament_id,
                "tournament_name": data.get('tournamentId', tournament_id),
                "match_id": m.get('match_id'),
                "round_num": m.get('round_num'),
                "aff_team": m.get('aff_name'),
                "neg_team": m.get('neg_name'),
                "result": m.get('result'),
                "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            })

        for email, records in judge_history_commits.items():
            success = False
            for record in records:
                if storage.append_to_judge_history(email, record):
                    success = True
            if success:
                updated_count += 1

        participant_updated_count = 0
        teams_data = data.get('teams', [])

        for team in teams_data:
            institution = team.get('institution', 'Unknown')
            team_name = team.get('name', 'Unknown')
            team_id = team.get('id')
            members = team.get('members', [])
            team_matches = [
                m for m in matches
                if (m.get('aff_id') == team_id or m.get('neg_id') == team_id) and m.get('result')
            ]
            if not team_matches:
                continue

            for member in members:
                member_email = member.get('email')
                if not member_email:
                    continue
                member_records = []
                for m in team_matches:
                    is_aff = m.get('aff_id') == team_id
                    side = "Aff" if is_aff else "Neg"
                    opponent_name = m.get('neg_name') if is_aff else m.get('aff_name')
                    raw_result = m.get('result')
                    if raw_result == 'A':
                        result = "Win" if is_aff else "Loss"
                    elif raw_result == 'N':
                        result = "Win" if not is_aff else "Loss"
                    else:
                        result = "Pending"
                    member_records.append({
                        "type": "participation",
                        "tournament_id": tournament_id,
                        "tournament_name": data.get('tournamentId', tournament_id),
                        "match_id": m.get('match_id'),
                        "round_num": m.get('round_num'),
                        "side": side,
                        "opponent": opponent_name,
                        "team_name": team_name,
                        "institution": institution,
                        "result": result,
                        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    })

                if member_records:
                    profile = storage.load_judge_profile(member_email)
                    if 'history' not in profile:
                        profile['history'] = []
                    profile['history'] = [
                        r for r in profile['history']
                        if not (r.get('tournament_id') == tournament_id and r.get('type') == 'participation')
                    ]
                    profile['history'].extend(member_records)
                    if storage.save_judge_profile(member_email, profile):
                        participant_updated_count += 1

        data['is_closed'] = True
        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action="TOURNAMENT_CLOSED",
                payload={"is_closed": True},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({
                "message": f"Tournament closed. {updated_count} judge and {participant_updated_count} participant profiles updated.",
                "updated_judges": updated_count,
                "updated_participants": participant_updated_count,
            }), 200
        return jsonify({"error": "Failed to save tournament closure"}), 500
    except Exception as e:
        logger.error(f"Error closing tournament {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500
