import logging
from dataclasses import asdict

from flask import Blueprint, jsonify, request

import auth
import storage
import tournament_manager as tm

logger = logging.getLogger(__name__)

bp = Blueprint('teams_coaches', __name__)


def _toggle_team_status(tournament_id, tm_fn, action, past_verb):
    try:
        req = request.json or {}
        team_id = req.get('team_id')
        if team_id is None:
            return jsonify({"error": "Missing team_id"}), 400

        data, teams = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Tournament is closed"}), 403

        if not tm_fn(data, teams, team_id):
            return jsonify({"error": f"Team {team_id} not found"}), 404

        if storage.patched_save_tournament_with_id(data, teams, tournament_id):
            storage.log_event(
                action=action,
                payload={"team_id": team_id},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": f"Team {team_id} {past_verb} successfully"}), 200
        return jsonify({"error": "Failed to save tournament state"}), 500
    except Exception as e:
        logger.error(f"Error updating team status ({action}): {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/register_team', methods=['POST'])
@auth.require_auth(allowed_roles=['admin', 'coach'])
def register_team_endpoint(tournament_id):
    """Allow coaches or admins to register a team."""
    try:
        user_info = getattr(request, 'user_info', None)
        user_email = user_info.get('email', '').lower() if user_info else ""

        data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404
        if data.get('is_closed'):
            return jsonify({"error": "Tournament is closed"}), 403

        auth_data = data.get('auth', {})
        admin_emails = [e.lower() for e in auth_data.get('admins', [])]
        coach_mapping = auth_data.get('coaches', {})

        is_admin = user_email in admin_emails
        coach_institution = coach_mapping.get(user_email)

        req_data = request.json
        team_id = req_data.get('id')
        team_name = req_data.get('name')
        institution = req_data.get('institution')
        members = req_data.get('members', [])

        if not team_name or not institution:
            return jsonify({"error": "Team name and institution are required"}), 400

        if not is_admin:
            if not coach_institution or institution != coach_institution:
                return jsonify({"error": f"Unauthorized: You can only register teams for {coach_institution}"}), 403

        if team_id is None and (data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0)):
            return jsonify({"error": "Registration is closed: Cannot register new teams after tournament has started or preliminary rounds have been paired"}), 400

        if team_id is not None:
            existing_team = next((t for t in teams_objs if t.id == team_id), None)
            if not existing_team:
                return jsonify({"error": "Team ID not found"}), 404
            if not is_admin and existing_team.institution != coach_institution:
                return jsonify({"error": "Unauthorized: Cannot edit team from another institution"}), 403
            existing_team.name = team_name
            existing_team.institution = institution
            existing_team.members = members
            registered_team = existing_team
            saved_id = team_id
        else:
            max_id = max([t.id for t in teams_objs] + [-1])
            new_team = tm.Team(id=max_id + 1, name=team_name, institution=institution, members=members)
            teams_objs.append(new_team)
            if 'config' in data and isinstance(data['config'], dict):
                data['config']['num_teams'] = len(teams_objs)
            registered_team = new_team
            saved_id = new_team.id

        if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
            storage.log_event(
                action="TEAM_REGISTERED",
                payload={"team": asdict(registered_team)},
                tournament_id=tournament_id,
                actor=user_email or auth.get_current_actor(),
            )
            return jsonify({"message": "Team registered successfully", "team_id": saved_id}), 200
        return jsonify({"error": "Failed to save tournament data"}), 500
    except Exception as e:
        logger.error(f"Error registering team: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/api/t/<tournament_id>/drop_team', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def drop_team_endpoint(tournament_id):
    """Drop a team from the tournament."""
    return _toggle_team_status(tournament_id, tm.drop_team, "TEAM_DROPPED", "dropped")


@bp.route('/api/t/<tournament_id>/reinstate_team', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def reinstate_team_endpoint(tournament_id):
    """Reinstate a dropped team."""
    return _toggle_team_status(tournament_id, tm.reinstate_team, "TEAM_REINSTATED", "reinstated")


@bp.route('/api/t/<tournament_id>/coaches', methods=['GET'])
@auth.require_auth(allowed_roles=['admin'])
def get_coaches_endpoint(tournament_id):
    """Get all registered coaches and their institutions for a tournament."""
    data, _ = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    coaches = data.get('auth', {}).get('coaches', {})
    return jsonify({"coaches": coaches}), 200


@bp.route('/api/t/<tournament_id>/coaches', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def add_coach_endpoint(tournament_id):
    """Add or update a coach's school assignment."""
    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    req = request.json or {}
    email = req.get('email', '').lower().strip()
    institution = req.get('institution', '').strip()
    if not email or not institution:
        return jsonify({"error": "Both email and institution are required"}), 400

    auth_data = data.setdefault('auth', {'admins': [], 'judges': {}, 'coaches': {}})
    auth_data.setdefault('coaches', {})[email] = institution
    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="COACH_ADDED",
            payload={"email": email, "institution": institution},
            tournament_id=tournament_id,
            actor=auth.get_current_actor(),
        )
        return jsonify({"message": f"Coach {email} assigned to {institution}", "coaches": auth_data['coaches']}), 200
    return jsonify({"error": "Failed to save tournament data"}), 500


@bp.route('/api/t/<tournament_id>/coaches/<path:coach_email>', methods=['DELETE'])
@auth.require_auth(allowed_roles=['admin'])
def remove_coach_endpoint(tournament_id, coach_email):
    """Remove a coach from a tournament."""
    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = coach_email.lower().strip()
    auth_data = data.get('auth', {})
    if 'coaches' in auth_data and email in auth_data['coaches']:
        del auth_data['coaches'][email]
        if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
            storage.log_event(
                action="COACH_REMOVED",
                payload={"email": email},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({"message": f"Coach {email} removed", "coaches": auth_data['coaches']}), 200
        return jsonify({"error": "Failed to save tournament data"}), 500
    return jsonify({"error": f"Coach {email} not found"}), 404
