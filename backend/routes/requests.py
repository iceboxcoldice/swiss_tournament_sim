import uuid
from dataclasses import asdict
from datetime import datetime

from flask import Blueprint, jsonify, request

import auth
import storage
import tournament_manager as tm

bp = Blueprint('requests', __name__)


def _load_open_tournament(tournament_id):
    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return None, None, (jsonify({"error": "Tournament not found"}), 404)
    if data.get('is_closed'):
        return None, None, (jsonify({"error": "Tournament is closed"}), 403)
    return data, teams_objs, None


def _reject_auth_request(tournament_id, request_key, email_raw, event_action, label):
    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = email_raw.lower().strip()
    requests_map = data.get('auth', {}).get(request_key, {})

    if email in requests_map:
        del requests_map[email]
        if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
            storage.log_event(
                action=event_action,
                payload={"email": email},
                tournament_id=tournament_id,
                actor=auth.get_current_actor(),
            )
            return jsonify({
                "message": f"{label} request for {email} rejected",
                request_key: requests_map,
            }), 200
        return jsonify({"error": "Failed to save tournament data"}), 500
    return jsonify({"error": f"No pending request found for {email}"}), 404


def _can_manage_team_request(data, user_email, institution):
    auth_data = data.get('auth', {})
    admin_emails = [e.lower() for e in auth_data.get('admins', [])]
    coach_mapping = auth_data.get('coaches', {})
    is_admin = auth.is_super_admin(user_email) or (user_email in admin_emails)
    coach_institution = coach_mapping.get(user_email)
    if is_admin:
        return True, coach_institution
    return institution.lower() == (coach_institution or '').lower(), coach_institution


# --- Coach Requests ---

@bp.route('/api/t/<tournament_id>/coach_requests', methods=['POST'])
@auth.require_auth()
def submit_coach_request_endpoint(tournament_id):
    """Allow an authenticated user to submit a request to be a coach for an institution."""
    user_info = getattr(request, 'user_info', None)
    if not user_info or not user_info.get('email'):
        return jsonify({"error": "Unauthorized: Login required"}), 401

    email = user_info.get('email').lower().strip()
    name = user_info.get('name', email)
    req = request.json or {}
    institution = req.get('institution', '').strip()
    if not institution:
        return jsonify({"error": "Institution name is required"}), 400

    data, teams_objs, err = _load_open_tournament(tournament_id)
    if err:
        return err

    auth_data = data.setdefault('auth', {'admins': [], 'judges': {}, 'coaches': {}, 'coach_requests': {}})
    coach_requests = auth_data.setdefault('coach_requests', {})
    coach_requests[email] = {
        'email': email,
        'name': name,
        'institution': institution,
        'requested_at': datetime.utcnow().isoformat(),
    }

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="COACH_REQUESTED",
            payload=coach_requests[email],
            tournament_id=tournament_id,
            actor=email,
        )
        return jsonify({
            "message": f"Coach request for {institution} submitted successfully",
            "request": coach_requests[email],
        }), 200
    return jsonify({"error": "Failed to save coach request"}), 500


@bp.route('/api/t/<tournament_id>/coach_requests', methods=['GET'])
@auth.require_auth(allowed_roles=['admin'])
def get_coach_requests_endpoint(tournament_id):
    """List all pending coach requests for a tournament (Admin only)."""
    data, _ = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    return jsonify({"coach_requests": data.get('auth', {}).get('coach_requests', {})}), 200


@bp.route('/api/t/<tournament_id>/coach_requests/<path:coach_email>/approve', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def approve_coach_request_endpoint(tournament_id, coach_email):
    """Approve a pending coach request and grant them coach privileges (Admin only)."""
    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = coach_email.lower().strip()
    auth_data = data.get('auth', {})
    requests_map = auth_data.get('coach_requests', {})

    if email not in requests_map:
        return jsonify({"error": f"No pending coach request found for {email}"}), 404

    req_entry = requests_map.pop(email)
    institution = req_entry.get('institution')
    auth_data.setdefault('coaches', {})[email] = institution

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="COACH_APPROVED",
            payload={"email": email, "institution": institution},
            tournament_id=tournament_id,
            actor=auth.get_current_actor(),
        )
        return jsonify({
            "message": f"Coach {email} approved for {institution}",
            "coaches": auth_data['coaches'],
            "coach_requests": requests_map,
        }), 200
    return jsonify({"error": "Failed to save tournament data"}), 500


@bp.route('/api/t/<tournament_id>/coach_requests/<path:coach_email>/reject', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def reject_coach_request_endpoint(tournament_id, coach_email):
    """Reject and remove a pending coach request (Admin only)."""
    return _reject_auth_request(tournament_id, 'coach_requests', coach_email, 'COACH_REJECTED', 'Coach')


# --- Judge Requests ---

@bp.route('/api/t/<tournament_id>/judge_requests', methods=['POST'])
@auth.require_auth()
def submit_judge_request_endpoint(tournament_id):
    """Allow an authenticated user to submit a request to volunteer/apply as a judge."""
    user_info = getattr(request, 'user_info', None)
    if not user_info or not user_info.get('email'):
        return jsonify({"error": "Unauthorized: Login required"}), 401

    email = user_info.get('email').lower().strip()
    name = user_info.get('name', email)
    req = request.json or {}
    institution = req.get('institution', '').strip() or 'Tournament Hire'
    paradigm = req.get('paradigm', '').strip()

    data, teams_objs, err = _load_open_tournament(tournament_id)
    if err:
        return err

    auth_data = data.setdefault('auth', {'admins': [], 'judges': {}, 'coaches': {}, 'coach_requests': {}, 'judge_requests': {}})
    judge_requests = auth_data.setdefault('judge_requests', {})
    judge_requests[email] = {
        'email': email,
        'name': name,
        'institution': institution,
        'paradigm': paradigm,
        'requested_at': datetime.utcnow().isoformat(),
    }

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="JUDGE_REQUESTED",
            payload=judge_requests[email],
            tournament_id=tournament_id,
            actor=email,
        )
        return jsonify({
            "message": "Judge application submitted successfully",
            "request": judge_requests[email],
        }), 200
    return jsonify({"error": "Failed to save judge request"}), 500


@bp.route('/api/t/<tournament_id>/judge_requests', methods=['GET'])
@auth.require_auth(allowed_roles=['admin'])
def get_judge_requests_endpoint(tournament_id):
    """List all pending judge applications for a tournament (Admin only)."""
    data, _ = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    return jsonify({"judge_requests": data.get('auth', {}).get('judge_requests', {})}), 200


@bp.route('/api/t/<tournament_id>/judge_requests/<path:judge_email>/approve', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def approve_judge_request_endpoint(tournament_id, judge_email):
    """Approve a pending judge request, allocate judge ID, and add to tournament pool (Admin only)."""
    data, teams_objs, err = _load_open_tournament(tournament_id)
    if err:
        return err

    email = judge_email.lower().strip()
    auth_data = data.get('auth', {})
    requests_map = auth_data.get('judge_requests', {})

    if email not in requests_map:
        return jsonify({"error": f"No pending judge request found for {email}"}), 404

    req_entry = requests_map.pop(email)
    name = req_entry.get('name', email)
    institution = req_entry.get('institution', 'Tournament Hire')
    paradigm = req_entry.get('paradigm', '')

    data.setdefault('judges', [])
    judge_id = data.get('next_judge_id', 1)
    new_judge = {
        "id": judge_id,
        "name": name,
        "institution": institution,
        "email": email,
        "matches_judged": [],
        "paradigm": paradigm,
    }
    data['judges'].append(new_judge)
    data['next_judge_id'] = judge_id + 1
    auth_data.setdefault('judges', {})[str(judge_id)] = email

    if paradigm:
        data.setdefault('paradigms', {})[str(judge_id)] = paradigm

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="JUDGE_APPROVED",
            payload={"judge": new_judge, "email": email},
            tournament_id=tournament_id,
            actor=auth.get_current_actor(),
        )
        return jsonify({
            "message": f"Judge {name} ({email}) approved",
            "judge": new_judge,
            "judge_requests": requests_map,
        }), 200
    return jsonify({"error": "Failed to save tournament data"}), 500


@bp.route('/api/t/<tournament_id>/judge_requests/<path:judge_email>/reject', methods=['POST'])
@auth.require_auth(allowed_roles=['admin'])
def reject_judge_request_endpoint(tournament_id, judge_email):
    """Reject and remove a pending judge request (Admin only)."""
    return _reject_auth_request(tournament_id, 'judge_requests', judge_email, 'JUDGE_REJECTED', 'Judge')


# --- Team Requests ---

@bp.route('/api/t/<tournament_id>/team_requests', methods=['POST'])
@auth.require_auth()
def submit_team_request_endpoint(tournament_id):
    """Allow students to submit a team entry under an approved coach for verification."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, teams_objs, err = _load_open_tournament(tournament_id)
    if err:
        return err

    if data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0):
        return jsonify({"error": "Registration is closed. Tournament has already started."}), 400

    req_data = request.json or {}
    team_name = req_data.get('name', '').strip()
    institution = req_data.get('institution', '').strip()
    members = req_data.get('members', [])

    if not team_name or not institution:
        return jsonify({"error": "Team name and institution are required"}), 400

    coach_mapping = data.get('auth', {}).get('coaches', {})
    approved_institutions = {inst.lower(): inst for inst in coach_mapping.values()}
    matched_institution = approved_institutions.get(institution.lower())
    if not matched_institution:
        return jsonify({
            "error": f"Institution '{institution}' does not have an approved coach for this tournament. A coach must be approved first before teams can register under it."
        }), 400

    institution = matched_institution
    team_requests = data.setdefault('team_requests', {})
    req_id = f"tr_{uuid.uuid4().hex[:8]}"
    team_requests[req_id] = {
        'id': req_id,
        'name': team_name,
        'institution': institution,
        'members': members,
        'submitted_by': user_email,
        'submitted_at': datetime.utcnow().isoformat(),
        'status': 'pending_coach_approval',
    }

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="TEAM_REQUESTED",
            payload=team_requests[req_id],
            tournament_id=tournament_id,
            actor=user_email or 'system',
        )
        return jsonify({
            "message": f"Team registration submitted to your {institution} coach for approval",
            "request_id": req_id,
            "request": team_requests[req_id],
        }), 200
    return jsonify({"error": "Failed to save team request"}), 500


@bp.route('/api/t/<tournament_id>/team_requests', methods=['GET'])
@auth.require_auth(allowed_roles=['admin', 'coach'])
def get_team_requests_endpoint(tournament_id):
    """List pending team registration requests. Coaches only see requests for their school."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, _ = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404

    auth_data = data.get('auth', {})
    admin_emails = [e.lower() for e in auth_data.get('admins', [])]
    coach_mapping = auth_data.get('coaches', {})
    is_admin = auth.is_super_admin(user_email) or (user_email in admin_emails)
    coach_institution = coach_mapping.get(user_email)

    requests_map = data.get('team_requests', {})
    if is_admin:
        filtered = requests_map
    else:
        filtered = {
            k: v for k, v in requests_map.items()
            if v.get('institution', '').lower() == (coach_institution or '').lower()
        }
    return jsonify({"team_requests": filtered}), 200


@bp.route('/api/t/<tournament_id>/team_requests/<request_id>/approve', methods=['POST'])
@auth.require_auth(allowed_roles=['admin', 'coach'])
def approve_team_request_endpoint(tournament_id, request_id):
    """Approve a student team registration request and officially add it to the tournament roster."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, teams_objs, err = _load_open_tournament(tournament_id)
    if err:
        return err

    if data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0):
        return jsonify({"error": "Registration is closed. Cannot add new teams after tournament has started."}), 400

    requests_map = data.get('team_requests', {})
    if request_id not in requests_map:
        return jsonify({"error": f"Team request {request_id} not found"}), 404

    req_entry = requests_map[request_id]
    institution = req_entry.get('institution', '')
    allowed, coach_institution = _can_manage_team_request(data, user_email, institution)
    if not allowed:
        return jsonify({"error": f"Unauthorized: You can only approve teams for {coach_institution}"}), 403

    del requests_map[request_id]
    max_id = max([t.id for t in teams_objs] + [-1])
    new_team = tm.Team(
        id=max_id + 1,
        name=req_entry['name'],
        institution=institution,
        members=req_entry.get('members', []),
    )
    teams_objs.append(new_team)
    if 'config' in data and isinstance(data['config'], dict):
        data['config']['num_teams'] = len(teams_objs)

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="TEAM_APPROVED",
            payload={"request_id": request_id, "team": asdict(new_team)},
            tournament_id=tournament_id,
            actor=user_email or auth.get_current_actor(),
        )
        return jsonify({
            "message": f"Team '{new_team.name}' approved and registered successfully",
            "team_id": new_team.id,
            "team_requests": requests_map,
        }), 200
    return jsonify({"error": "Failed to save team registration"}), 500


@bp.route('/api/t/<tournament_id>/team_requests/<request_id>/reject', methods=['POST'])
@auth.require_auth(allowed_roles=['admin', 'coach'])
def reject_team_request_endpoint(tournament_id, request_id):
    """Reject and remove a student team registration request."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404

    requests_map = data.get('team_requests', {})
    if request_id not in requests_map:
        return jsonify({"error": f"Team request {request_id} not found"}), 404

    req_entry = requests_map[request_id]
    institution = req_entry.get('institution', '')
    allowed, coach_institution = _can_manage_team_request(data, user_email, institution)
    if not allowed:
        return jsonify({"error": f"Unauthorized: You can only reject teams for {coach_institution}"}), 403

    del requests_map[request_id]
    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="TEAM_REJECTED",
            payload={"request_id": request_id},
            tournament_id=tournament_id,
            actor=user_email or auth.get_current_actor(),
        )
        return jsonify({
            "message": "Team registration request rejected",
            "team_requests": requests_map,
        }), 200
    return jsonify({"error": "Failed to save tournament data"}), 500
