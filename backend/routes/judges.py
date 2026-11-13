import logging

from flask import Blueprint, jsonify, request

import auth
import storage
import tournament_manager as tm

logger = logging.getLogger(__name__)

bp = Blueprint('judges', __name__)


@bp.route('/api/t/<tournament_id>/judge', methods=['POST', 'DELETE'])
@auth.require_auth(allowed_roles=['admin'])
def manage_judge(tournament_id):
    """Add or remove a judge."""
    try:
        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "No tournament found"}), 404

        if 'judges' not in data:
            data['judges'] = []

        if data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and cannot be modified"}), 403

        if request.method == 'POST':
            req_data = request.json
            logger.info(f"manage_judge POST: received data = {req_data}")
            name = req_data.get('name')
            institution = req_data.get('institution', '').strip() or 'Tournament Hire'
            email = req_data.get('email', '').strip()
            logger.info(f"manage_judge POST: name={name}, institution={institution}, email='{email}'")

            if not name:
                return jsonify({"error": "Missing judge name"}), 400

            judge_id = data.get('next_judge_id', 1)
            conflicts = req_data.get('conflicts', [])
            new_judge = {
                "id": judge_id,
                "name": name,
                "institution": institution,
                "email": email,
                "conflicts": conflicts,
                "matches_judged": [],
            }
            data['judges'].append(new_judge)
            data['next_judge_id'] = judge_id + 1

            if 'auth' not in data:
                data['auth'] = {'admins': [], 'judges': {}, 'coaches': {}}
            if 'judges' not in data['auth']:
                data['auth']['judges'] = {}
            if 'coaches' not in data['auth']:
                data['auth']['coaches'] = {}
            if email:
                data['auth']['judges'][str(judge_id)] = email

            if storage.patched_save_tournament_with_id(data, teams, tournament_id):
                storage.log_event(
                    action="JUDGE_ADDED",
                    payload={"judge": new_judge},
                    tournament_id=tournament_id,
                    actor=auth.get_current_actor(),
                )
                return jsonify({"message": "Judge added", "judge": new_judge}), 200
            return jsonify({"error": "Failed to save judge"}), 500

        if request.method == 'DELETE':
            judge_id = request.json.get('judge_id')
            if judge_id is None:
                return jsonify({"error": "Missing judge_id"}), 400

            data['judges'] = [j for j in data['judges'] if j.get('id') != judge_id]
            if 'auth' in data and 'judges' in data['auth']:
                data['auth']['judges'].pop(str(judge_id), None)

            if storage.patched_save_tournament_with_id(data, teams, tournament_id):
                storage.log_event(
                    action="JUDGE_REMOVED",
                    payload={"judge_id": judge_id},
                    tournament_id=tournament_id,
                    actor=auth.get_current_actor(),
                )
                return jsonify({"message": f"Judge {judge_id} removed"}), 200
            return jsonify({"error": "Failed to save judge removal"}), 500
    except Exception as e:
        logger.error(f"Error managing judge: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/assign_judge', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def assign_judge(tournament_id):
    """Assign or unassign a judge from a match."""
    try:
        req_data = request.json
        match_id = req_data.get('match_id')
        judge_id = req_data.get('judge_id')

        if match_id is None:
            return jsonify({"error": "Missing match_id"}), 400

        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "No tournament found"}), 404

        match = next((m for m in data['matches'] if m['match_id'] == match_id), None)
        if not match:
            return jsonify({"error": f"Match {match_id} not found"}), 404

        old_judge_id = match.get('judge_id')
        new_judge_id = judge_id if judge_id is not None and judge_id != -1 else None

        if old_judge_id is not None:
            old_judge = next((j for j in data.get('judges', []) if j.get('id') == old_judge_id), None)
            if old_judge and match_id in old_judge.get('matches_judged', []):
                old_judge.setdefault('matches_judged', []).remove(match_id)

        force = req_data.get('force', False)
        if new_judge_id is not None:
            new_judge = next((j for j in data.get('judges', []) if j.get('id') == new_judge_id), None)
            if not new_judge:
                return jsonify({"error": f"Judge {new_judge_id} not found"}), 404

            has_conflict, conflict_reason = tm.check_judge_conflict(new_judge, match, teams)
            if has_conflict and not force:
                return jsonify({
                    "error": conflict_reason,
                    "has_conflict": True,
                    "conflict_reason": conflict_reason,
                }), 400

            if match_id not in new_judge.setdefault('matches_judged', []):
                new_judge['matches_judged'].append(match_id)

        match['judge_id'] = new_judge_id

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action="JUDGE_ASSIGNED",
                payload={"match_id": match_id, "judge_id": new_judge_id, "forced": force if new_judge_id else False},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": f"Judge assignment updated for match {match_id}"}), 200
        return jsonify({"error": "Failed to save judge assignment"}), 500
    except Exception as e:
        logger.error(f"Error assigning judge: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/auto_assign_judges', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def auto_assign_judges_endpoint(tournament_id):
    """Automatically assign available unconflicted judges to round matches."""
    try:
        req_data = request.json or {}
        round_num = req_data.get('round_num')
        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "No tournament found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed"}), 403

        assignments = tm.auto_assign_judges(data, teams, round_num)

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action="JUDGES_AUTO_ASSIGNED",
                payload={"round_num": round_num or data.get('current_round'), "assignments": assignments},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({
                "message": f"Successfully assigned {len(assignments)} judges",
                "assignments": assignments,
            }), 200
        return jsonify({"error": "Failed to save judge assignments"}), 500
    except Exception as e:
        logger.error(f"Error auto-assigning judges: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/judge/<int:judge_id>/conflicts', methods=['GET', 'POST'])
@auth.require_auth(allowed_roles=['admin'])
def manage_judge_conflicts(tournament_id, judge_id):
    """View or update conflicts for a judge."""
    try:
        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404

        judge = next((j for j in data.get('judges', []) if j.get('id') == judge_id), None)
        if not judge:
            return jsonify({"error": f"Judge {judge_id} not found"}), 404

        if request.method == 'GET':
            return jsonify({"judge_id": judge_id, "conflicts": judge.get('conflicts', [])}), 200

        if data.get('is_closed'):
            return jsonify({"error": "Tournament is closed"}), 403

        req_data = request.json or {}
        conflicts = req_data.get('conflicts', [])
        judge['conflicts'] = conflicts

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action="JUDGE_CONFLICTS_UPDATED",
                payload={"judge_id": judge_id, "conflicts": conflicts},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": "Conflicts updated", "judge_id": judge_id, "conflicts": conflicts}), 200
        return jsonify({"error": "Failed to save conflicts"}), 500
    except Exception as e:
        logger.error(f"Error managing judge conflicts: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/assign_panel', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def assign_panel_endpoint(tournament_id):
    """Assign a multi-judge panel to a match."""
    try:
        req_data = request.json or {}
        match_id = req_data.get('match_id')
        panel = req_data.get('panel', [])

        if not match_id:
            return jsonify({"error": "Missing match_id"}), 400
        if not isinstance(panel, list):
            return jsonify({"error": "Panel must be a list of judge IDs"}), 400

        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404

        match = next((m for m in data['matches'] if m['match_id'] == match_id), None)
        if not match:
            return jsonify({"error": f"Match {match_id} not found"}), 404

        match['panel'] = panel
        if panel:
            match['judge_id'] = panel[0]
            for jid in panel:
                judge = next((j for j in data.get('judges', []) if j.get('id') == jid), None)
                if judge:
                    judge.setdefault('matches_judged', [])
                    if match_id not in judge['matches_judged']:
                        judge['matches_judged'].append(match_id)

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action="PANEL_ASSIGNED",
                payload={"match_id": match_id, "panel": panel},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": f"Panel assigned to Match {match_id}", "panel": panel}), 200
        return jsonify({"error": "Failed to save panel assignment"}), 500
    except Exception as e:
        logger.error(f"Error assigning panel: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/judge_profile/<email>', methods=['GET'])
@bp.route('/api/profile/<email>', methods=['GET'])
def get_judge_profile_endpoint(email):
    """Get global profile for a specific email."""
    profile = storage.load_judge_profile(email)
    return jsonify(profile), 200


@bp.route('/api/judge_profile', methods=['POST'])
@bp.route('/api/profile', methods=['POST'])
@auth.require_auth()
def update_judge_profile_endpoint():
    """Update paradigm in profile for the authenticated user."""
    if not request.user_info:
        return jsonify({"error": "Unauthorized: No user info"}), 401

    user_email = request.user_info.get('email').lower()
    data = request.json
    paradigm_text = data.get('paradigm', '')

    profile = storage.load_judge_profile(user_email)
    profile['paradigm'] = paradigm_text

    if storage.save_judge_profile(user_email, profile):
        storage.log_event(
            action="PARADIGM_UPDATED",
            payload={"email": user_email, "paradigm": paradigm_text},
            actor=user_email,
        )
        return jsonify({"message": "Profile updated successfuly"}), 200
    return jsonify({"error": "Failed to save profile"}), 500


@bp.route('/api/user/link_email', methods=['POST'])
@bp.route('/api/link_email', methods=['POST'])
@auth.require_auth()
def link_email_endpoint():
    """Link a secondary email to the authenticated user's primary profile."""
    if not request.user_info:
        return jsonify({"error": "Unauthorized"}), 401

    primary_email = request.user_info.get('email').lower().strip()
    data = request.json
    secondary_email = data.get('secondary_email', '').lower().strip()

    if not secondary_email or secondary_email == primary_email:
        return jsonify({"error": "Invalid secondary email"}), 400

    aliases = storage.load_aliases()
    if secondary_email in aliases and aliases[secondary_email] != primary_email:
        return jsonify({"error": f"Email {secondary_email} is already linked to another account"}), 400

    secondary_profile = storage.load_raw_profile(secondary_email)

    aliases[secondary_email] = primary_email
    if not storage.save_aliases(aliases):
        return jsonify({"error": "Failed to save alias mapping"}), 500

    profile = storage.load_judge_profile(primary_email)
    if 'aliases' not in profile:
        profile['aliases'] = []
    if secondary_email not in profile['aliases']:
        profile['aliases'].append(secondary_email)

    if secondary_profile:
        if not profile.get('paradigm') and secondary_profile.get('paradigm'):
            profile['paradigm'] = secondary_profile['paradigm']

        if 'history' not in profile:
            profile['history'] = []

        existing_keys = set(
            (h.get('tournament_id'), h.get('round_num'), h.get('match_id'), h.get('type'))
            for h in profile['history']
        )
        for record in secondary_profile.get('history', []):
            key = (record.get('tournament_id'), record.get('round_num'), record.get('match_id'), record.get('type'))
            if key not in existing_keys:
                profile['history'].append(record)
                existing_keys.add(key)

    if storage.save_judge_profile(primary_email, profile):
        storage.log_event(
            action="EMAIL_LINKED",
            payload={"primary_email": primary_email, "secondary_email": secondary_email},
            actor=primary_email,
        )
        return jsonify({"message": f"Successfully linked {secondary_email} to {primary_email}", "profile": profile}), 200
    return jsonify({"error": "Failed to update profile"}), 500
