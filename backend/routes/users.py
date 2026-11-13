import os
import sys
from datetime import datetime

from flask import Blueprint, jsonify, request

import auth
import config
import storage

bp = Blueprint('users', __name__)


def _super_admin_guard():
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    if not auth.is_super_admin(email) and config.get_setting('GOOGLE_OAUTH_CLIENT_ID'):
        return None, (jsonify({"error": "Forbidden: Requires Super Admin privileges"}), 403)
    return email, None


@bp.route('/api/user/super_admin_status', methods=['GET'])
@auth.require_auth()
def get_super_admin_status():
    """Check if current authenticated user is a Super Admin."""
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    return jsonify({
        "email": email,
        "is_super_admin": auth.is_super_admin(email),
    }), 200


@bp.route('/api/t/<tournament_id>/approve', methods=['POST'])
@auth.require_auth()
def approve_tournament(tournament_id):
    """Approve a pending tournament request (Super Admin only)."""
    email, err = _super_admin_guard()
    if err:
        return err

    data, teams_objs = storage.patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404

    data['status'] = 'approved'
    data['approved_by'] = email if email else 'admin'
    data['approved_at'] = datetime.utcnow().isoformat()

    if storage.patched_save_tournament_with_id(data, teams_objs, tournament_id):
        storage.log_event(
            action="TOURNAMENT_APPROVED",
            payload={"status": "approved", "approved_by": email or "admin"},
            tournament_id=tournament_id,
            actor=email or 'system',
        )
        return jsonify({"message": f"Tournament {tournament_id} approved successfully", "status": "approved"}), 200
    return jsonify({"error": "Failed to save tournament approval"}), 500


@bp.route('/api/t/<tournament_id>/reject', methods=['POST'])
@auth.require_auth()
def reject_tournament(tournament_id):
    """Reject and delete a pending tournament request (Super Admin only)."""
    email, err = _super_admin_guard()
    if err:
        return err

    path = storage.get_blob_path(tournament_id)
    bucket_name = config.get_setting('BUCKET_NAME')
    if bucket_name:
        client = storage.get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path)
        if blob.exists():
            blob.delete()
    else:
        if os.path.exists(path):
            os.remove(path)
            try:
                os.rmdir(os.path.dirname(path))
            except OSError:
                pass
    storage.log_event(
        action="TOURNAMENT_REJECTED",
        payload={"status": "rejected"},
        tournament_id=tournament_id,
        actor=email or 'system',
    )
    return jsonify({"message": f"Tournament {tournament_id} request rejected and removed"}), 200


@bp.route('/api/user/status', methods=['GET'])
@auth.require_auth()
def get_user_status_endpoint():
    """Retrieve the current user's registration and approval status."""
    user_info = getattr(request, 'user_info', None)
    if not user_info:
        return jsonify({"status": "unauthenticated"}), 401
    email = user_info.get('email', '').lower().strip()
    name = user_info.get('name', '')
    entry = auth.get_or_create_user_registration(email, name)
    return jsonify({
        "email": email,
        "name": entry.get('name', ''),
        "status": entry.get('status', 'pending'),
        "is_super_admin": auth.is_super_admin(email),
        "is_approved": auth.is_user_approved(email),
        "testing_mode": config.get_setting('TESTING_MODE'),
        "require_user_approval": config.get_setting('REQUIRE_USER_APPROVAL'),
    }), 200


@bp.route('/api/user/register', methods=['POST'])
@auth.require_auth()
def request_user_registration_endpoint():
    """Explicitly request platform user registration."""
    user_info = getattr(request, 'user_info', None)
    if not user_info:
        return jsonify({"error": "Unauthorized"}), 401
    email = user_info.get('email', '').lower().strip()
    data = request.json or {}
    name = data.get('name', user_info.get('name', ''))
    institution = data.get('institution', '')
    intent = data.get('intent', '')

    registry = storage.load_user_registry()
    now_iso = datetime.utcnow().isoformat() + "Z"
    is_sa = auth.is_super_admin(email)
    status = 'approved' if is_sa else 'pending'

    entry = registry.get(email, {})
    entry.update({
        "email": email,
        "name": name or email.split('@')[0],
        "institution": institution,
        "intent": intent,
        "status": entry.get('status', status) if not is_sa else 'approved',
        "is_super_admin": is_sa,
        "requested_at": entry.get('requested_at', now_iso),
        "approved_by": entry.get('approved_by') if not is_sa else 'system',
        "approved_at": entry.get('approved_at') if not is_sa else now_iso,
    })
    registry[email] = entry
    storage.save_user_registry(registry)
    storage.log_event(
        action="USER_REGISTRATION_SUBMITTED",
        payload={"email": email, "institution": institution, "status": entry['status']},
        actor=email,
    )
    return jsonify({
        "message": "User registration request submitted." if entry['status'] == 'pending' else "User registration active.",
        "user": entry,
    }), 200


@bp.route('/api/admin/users', methods=['GET'])
@auth.require_auth()
def list_registered_users_endpoint():
    """List all registered users and their approval statuses (Super Admin only)."""
    _, err = _super_admin_guard()
    if err:
        return err

    registry = storage.load_user_registry()
    users_list = list(registry.values())
    users_list.sort(key=lambda u: u.get('requested_at', ''), reverse=True)
    return jsonify({
        "count": len(users_list),
        "testing_mode": config.get_setting('TESTING_MODE'),
        "require_user_approval": config.get_setting('REQUIRE_USER_APPROVAL'),
        "users": users_list,
    }), 200


@bp.route('/api/admin/users/<target_email>/approve', methods=['POST'])
@auth.require_auth()
def approve_user_endpoint(target_email):
    """Approve a user registration (Super Admin only)."""
    email, err = _super_admin_guard()
    if err:
        return err

    target = target_email.lower().strip()
    registry = storage.load_user_registry()
    if target not in registry:
        registry[target] = {
            "email": target,
            "name": target.split('@')[0],
            "status": "approved",
            "requested_at": datetime.utcnow().isoformat() + "Z",
        }

    registry[target]['status'] = 'approved'
    registry[target]['approved_by'] = email or 'super_admin'
    registry[target]['approved_at'] = datetime.utcnow().isoformat() + "Z"
    storage.save_user_registry(registry)

    storage.log_event(
        action="USER_APPROVED",
        payload={"approved_user": target, "approved_by": email or "super_admin"},
        actor=email or 'system',
    )
    return jsonify({"message": f"User {target} approved successfully", "user": registry[target]}), 200


@bp.route('/api/admin/users/<target_email>/reject', methods=['POST'])
@auth.require_auth()
def reject_user_endpoint(target_email):
    """Reject a user registration (Super Admin only)."""
    email, err = _super_admin_guard()
    if err:
        return err

    target = target_email.lower().strip()
    if auth.is_super_admin(target):
        return jsonify({"error": "Cannot reject Super Admin"}), 400

    registry = storage.load_user_registry()
    if target in registry:
        registry[target]['status'] = 'rejected'
        registry[target]['rejected_by'] = email or 'super_admin'
        registry[target]['rejected_at'] = datetime.utcnow().isoformat() + "Z"
        storage.save_user_registry(registry)

    storage.log_event(
        action="USER_REJECTED",
        payload={"rejected_user": target, "rejected_by": email or "super_admin"},
        actor=email or 'system',
    )
    return jsonify({"message": f"User {target} registration rejected"}), 200


@bp.route('/api/admin/config', methods=['GET', 'POST'])
@auth.require_auth()
def manage_platform_config_endpoint():
    """View or update platform configuration (Super Admin only)."""
    email, err = _super_admin_guard()
    if err:
        return err

    if request.method == 'POST':
        data = request.json or {}
        if 'testing_mode' in data:
            val = bool(data['testing_mode'])
            config.TESTING_MODE = val
            for mod_name in ('main', 'backend.main'):
                if mod_name in sys.modules:
                    setattr(sys.modules[mod_name], 'TESTING_MODE', val)
        if 'require_user_approval' in data:
            val = bool(data['require_user_approval'])
            config.REQUIRE_USER_APPROVAL = val
            for mod_name in ('main', 'backend.main'):
                if mod_name in sys.modules:
                    setattr(sys.modules[mod_name], 'REQUIRE_USER_APPROVAL', val)
        storage.log_event(
            action="PLATFORM_CONFIG_UPDATED",
            payload={
                "testing_mode": config.get_setting('TESTING_MODE'),
                "require_user_approval": config.get_setting('REQUIRE_USER_APPROVAL'),
            },
            actor=email or 'system',
        )

    return jsonify({
        "testing_mode": config.get_setting('TESTING_MODE'),
        "require_user_approval": config.get_setting('REQUIRE_USER_APPROVAL'),
        "super_admin_emails": config.get_setting('SUPER_ADMIN_EMAILS'),
    }), 200
