import logging
import sys
from datetime import datetime
from functools import wraps

from flask import jsonify, request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

import config
import storage

logger = logging.getLogger(__name__)


def is_super_admin(email):
    """Check if the given email is in the global Super Admin allowlist."""
    if not email:
        return False
    return email.lower().strip() in config.get_setting('SUPER_ADMIN_EMAILS')


def verify_google_token(token):
    """Verify Google ID token and return user info dict or None."""
    client_id = config.get_setting('GOOGLE_OAUTH_CLIENT_ID')
    if not client_id:
        return None
    try:
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id
        )
        return {
            'email': idinfo.get('email', '').lower(),
            'name': idinfo.get('name', ''),
            'picture': idinfo.get('picture', ''),
        }
    except ValueError as e:
        logger.warning(f"Token verification failed: {e}")
        return None


def _verify_google_token_dispatch(token):
    """Allow tests patching main.verify_google_token to intercept token verification."""
    for mod_name in ('main', 'backend.main'):
        mod = sys.modules.get(mod_name)
        if mod is not None and hasattr(mod, 'verify_google_token'):
            fn = getattr(mod, 'verify_google_token')
            if fn is not verify_google_token:
                return fn(token)
    return verify_google_token(token)


def is_user_approved(email):
    """Check if a user is approved to perform actions on the platform."""
    if not email:
        return False
    email_clean = email.lower().strip()
    if is_super_admin(email_clean):
        return True
    if not config.get_setting('REQUIRE_USER_APPROVAL') and not config.get_setting('TESTING_MODE'):
        return True
    registry = storage.load_user_registry()
    user_entry = registry.get(email_clean)
    if user_entry and user_entry.get('status') == 'approved':
        return True
    return False


def get_or_create_user_registration(email, name=""):
    """Fetch user registration status or record a new pending request."""
    if not email:
        return None
    email_clean = email.lower().strip()
    registry = storage.load_user_registry()
    if email_clean in registry:
        return registry[email_clean]

    is_sa = is_super_admin(email_clean)
    status = 'approved' if is_sa else 'pending'
    now_iso = datetime.utcnow().isoformat() + "Z"
    entry = {
        "email": email_clean,
        "name": name or email_clean.split('@')[0],
        "status": status,
        "is_super_admin": is_sa,
        "requested_at": now_iso,
        "approved_by": "system" if is_sa else None,
        "approved_at": now_iso if is_sa else None,
    }
    registry[email_clean] = entry
    storage.save_user_registry(registry)
    storage.log_event(
        action="USER_REGISTRATION_CREATED",
        payload={"email": email_clean, "status": status, "is_super_admin": is_sa},
        actor=email_clean,
    )
    return entry


def get_current_actor():
    """Retrieve current actor's email or identifier from request context."""
    user_info = getattr(request, 'user_info', None)
    if user_info and user_info.get('email'):
        return user_info.get('email').lower().strip()
    actor_header = request.headers.get('X-User-Email')
    if actor_header:
        return actor_header.lower().strip()
    return 'system'


def require_auth(allowed_roles=None):
    """
    Decorator to enforce Google OAuth and role-based access control.
    If GOOGLE_OAUTH_CLIENT_ID is not configured, auth is bypassed (local dev mode).
    allowed_roles can be a list containing 'admin', 'judge', 'coach'.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            client_id = config.get_setting('GOOGLE_OAUTH_CLIENT_ID')
            if not client_id:
                dev_email = request.headers.get('X-User-Email')
                if dev_email:
                    request.user_info = {'email': dev_email.lower().strip(), 'name': dev_email.split('@')[0]}
                else:
                    request.user_info = None
                return f(*args, **kwargs)

            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({"error": "Unauthorized: Missing or invalid Authorization header"}), 401

            token = auth_header.split('Bearer ')[1].strip()
            user_info = _verify_google_token_dispatch(token)
            if not user_info or not user_info.get('email'):
                return jsonify({"error": "Unauthorized: Invalid or expired token"}), 401

            request.user_info = user_info
            user_email = user_info['email'].lower().strip()

            endpoint_name = (request.endpoint or '').split('.')[-1]

            tournament_id = kwargs.get('tournament_id') or request.view_args.get('tournament_id')
            if tournament_id and endpoint_name != 'init_tournament':
                data, _ = storage.patched_load_tournament_with_id(tournament_id)
                if not data:
                    return jsonify({"error": "Tournament not found"}), 404

                if data.get('status') == 'pending' and endpoint_name in [
                    'pair_round',
                    'report_result',
                    'register_team_endpoint',
                    'manage_judge',
                    'assign_judge',
                    'add_coach_endpoint',
                ]:
                    return jsonify({"error": "Forbidden: Tournament is pending approval by Super Admin"}), 403

                if allowed_roles:
                    auth_data = data.get('auth', {})
                    admin_emails = [e.lower() for e in auth_data.get('admins', [])]
                    judge_mapping = auth_data.get('judges', {})
                    coach_mapping = auth_data.get('coaches', {})

                    has_role = False
                    if is_super_admin(user_email):
                        has_role = True
                    elif 'admin' in allowed_roles and user_email in admin_emails:
                        has_role = True

                    if not has_role and 'judge' in allowed_roles:
                        if any(e.lower() == user_email for e in judge_mapping.values()):
                            has_role = True

                    if not has_role and 'coach' in allowed_roles:
                        if any(e.lower() == user_email for e in coach_mapping.keys()):
                            has_role = True

                    if not has_role:
                        logger.warning(f"Access Denied for {user_email}. Required roles: {allowed_roles}")
                        return jsonify({"error": f"Forbidden: Requires one of roles {allowed_roles}"}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator
