from flask import Blueprint, jsonify, request

import auth
import config
import event_replay
import storage

bp = Blueprint('events', __name__)


def _require_super_admin():
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    if not auth.is_super_admin(email) and config.get_setting('GOOGLE_OAUTH_CLIENT_ID'):
        return jsonify({"error": "Forbidden: Requires Super Admin privileges"}), 403
    return None


@bp.route('/api/t/<tournament_id>/events', methods=['GET'])
@auth.require_auth(allowed_roles=['admin'])
def get_tournament_events_endpoint(tournament_id):
    """Retrieve event journal for a specific tournament (Admin/Super Admin only)."""
    events = storage.load_events_from_storage(tournament_id)
    return jsonify({
        "tournament_id": tournament_id,
        "count": len(events),
        "events": events,
    }), 200


@bp.route('/api/events', methods=['GET'])
@auth.require_auth()
def get_all_events_endpoint():
    """Retrieve central platform event journal (Super Admin only)."""
    err = _require_super_admin()
    if err:
        return err

    events = storage.load_events_from_storage()
    tid = request.args.get('tournament_id')
    action = request.args.get('action')
    if tid:
        events = [e for e in events if e.get('tournament_id') == tid]
    if action:
        events = [e for e in events if e.get('action') == action]

    limit = request.args.get('limit', type=int)
    if limit and limit > 0:
        events = events[-limit:]

    return jsonify({
        "count": len(events),
        "events": events,
    }), 200


@bp.route('/api/t/<tournament_id>/verify_consistency', methods=['GET'])
@auth.require_auth(allowed_roles=['admin'])
def verify_tournament_consistency_endpoint(tournament_id):
    """Run an automated consistency and rule validation check for a tournament."""
    report = event_replay.verify_storage_consistency(config.get_setting('LOCAL_STORAGE_DIR'), tournament_id)
    status_code = 200 if report.get('is_consistent') else 409
    return jsonify(report), status_code


@bp.route('/api/verify_consistency', methods=['GET'])
@auth.require_auth()
def verify_platform_consistency_endpoint():
    """Run an automated consistency and rule validation check across all tournaments (Super Admin only)."""
    err = _require_super_admin()
    if err:
        return err

    report = event_replay.verify_storage_consistency(config.get_setting('LOCAL_STORAGE_DIR'))
    status_code = 200 if report.get('is_consistent') else 409
    return jsonify(report), status_code
