import os
import json
import logging
from datetime import datetime
from dataclasses import asdict
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google.cloud import storage
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from functools import wraps
import tournament_manager as tm
import swiss_sim

app = Flask(__name__, static_folder='docs/manager', static_url_path='')
# Enable CORS for GitHub Pages and local development
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "https://iceboxcoldice.github.io",
            "http://localhost:*",
            "http://127.0.0.1:*"
        ],
        "allow_headers": ["Content-Type", "Authorization"],
        "methods": ["GET", "POST", "OPTIONS"],
        "supports_credentials": False
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# GCS Configuration
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID')
DEFAULT_TOURNAMENT_ID = 'default'
LOCAL_STORAGE_DIR = 'local_storage'

# Super Admin Configuration
SUPER_ADMIN_EMAILS = [
    e.strip().lower() for e in os.environ.get('SUPER_ADMIN_EMAILS', 'coldice@gmail.com').split(',') if e.strip()
]

def is_super_admin(email):
    """Check if an email has global Super Admin privileges."""
    if not email:
        return False
    return email.lower().strip() in SUPER_ADMIN_EMAILS

import event_replay

def get_current_actor():
    """Retrieve current actor's email or identifier from request context."""
    user_info = getattr(request, 'user_info', None)
    if user_info and user_info.get('email'):
        return user_info.get('email').lower().strip()
    actor_header = request.headers.get('X-User-Email')
    if actor_header:
        return actor_header.lower().strip()
    return 'system'

def log_event(action, payload, tournament_id=None, actor=None):
    """Log an immutable event to the journal (local and/or GCS)."""
    try:
        actor_email = actor or get_current_actor()
        storage_dir = LOCAL_STORAGE_DIR
        gcs_bucket = None
        if BUCKET_NAME:
            try:
                gcs_bucket = get_storage_client().bucket(BUCKET_NAME)
            except Exception as e:
                logger.error(f"Error accessing GCS bucket for event log: {e}")
        return event_replay.record_event(
            storage_dir=storage_dir,
            action=action,
            payload=payload,
            actor=actor_email,
            tournament_id=tournament_id,
            gcs_bucket=gcs_bucket
        )
    except Exception as e:
        logger.error(f"Failed to record event {action}: {e}")
        return None

def load_events_from_storage(tournament_id=None):
    """Load sequential event stream from GCS or local storage."""
    if BUCKET_NAME:
        try:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            path = f"tournaments/{tournament_id}/{event_replay.EVENTS_LOG_FILE}" if tournament_id else f"events/{event_replay.EVENTS_LOG_FILE}"
            blob = bucket.blob(path)
            if not blob.exists():
                return []
            content = blob.download_as_text()
            events = []
            for line in content.splitlines():
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            return events
        except Exception as e:
            logger.error(f"Error loading events from GCS: {e}")
            return []
    else:
        log_path = event_replay.get_event_log_path(LOCAL_STORAGE_DIR, tournament_id)
        return event_replay.load_events(log_path)

if not BUCKET_NAME:
    logger.info("GCS_BUCKET_NAME not set. Using local filesystem storage.")
    if not os.path.exists(LOCAL_STORAGE_DIR):
        os.makedirs(LOCAL_STORAGE_DIR)

def get_storage_client():
    return storage.Client()

def get_blob_path(tournament_id):
    """Get the storage path for a specific tournament."""
    if not tournament_id:
        tournament_id = DEFAULT_TOURNAMENT_ID
    if BUCKET_NAME:
        return f"tournaments/{tournament_id}/tournament.json"
    else:
        # Local path
        t_dir = os.path.join(LOCAL_STORAGE_DIR, tournament_id)
        if not os.path.exists(t_dir):
            os.makedirs(t_dir)
        return os.path.join(t_dir, 'tournament.json')

def load_tournament_from_gcs(tournament_id=DEFAULT_TOURNAMENT_ID):
    """Load tournament data from storage (GCS or Local)."""
    try:
        path = get_blob_path(tournament_id)
        
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            if not blob.exists():
                return None
            data_str = blob.download_as_text()
        else:
            if not os.path.exists(path):
                return None
            with open(path, 'r') as f:
                data_str = f.read()
                
        return json.loads(data_str)
    except Exception as e:
        logger.error(f"Error loading {tournament_id}: {e}")
        return None

def save_tournament_to_gcs(data, tournament_id=DEFAULT_TOURNAMENT_ID):
    """Save tournament data to storage (GCS or Local)."""
    try:
        path = get_blob_path(tournament_id)
        data_str = json.dumps(data, indent=2)
        
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            blob.upload_from_string(data_str, content_type='application/json')
        else:
            with open(path, 'w') as f:
                f.write(data_str)
        return True
    except Exception as e:
        logger.error(f"Error saving {tournament_id}: {e}")
        return False

def get_aliases_path():
    if BUCKET_NAME:
        return "profiles/aliases.json"
    else:
        p_dir = os.path.join(LOCAL_STORAGE_DIR, 'profiles')
        if not os.path.exists(p_dir):
            os.makedirs(p_dir)
        return os.path.join(p_dir, "aliases.json")

def load_aliases():
    try:
        path = get_aliases_path()
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            if blob.exists():
                return json.loads(blob.download_as_text())
        else:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    return json.load(f)
    except Exception as e:
        logger.error(f"Error loading aliases: {e}")
    return {}

def save_aliases(aliases_dict):
    try:
        path = get_aliases_path()
        data_str = json.dumps(aliases_dict, indent=2)
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            blob.upload_from_string(data_str, content_type='application/json')
        else:
            with open(path, 'w') as f:
                f.write(data_str)
        return True
    except Exception as e:
        logger.error(f"Error saving aliases: {e}")
        return False

def resolve_email(email):
    """Resolve secondary email to primary email using aliases.json if it exists."""
    email = email.lower().strip()
    aliases = load_aliases()
    return aliases.get(email, email)

def get_profile_path(email):
    """Get storage path for a user's profile."""
    resolved_email = resolve_email(email)
    safe_email = resolved_email.replace('@', '_at_').replace('.', '_')
    if BUCKET_NAME:
        return f"profiles/{safe_email}.json"
    else:
        p_dir = os.path.join(LOCAL_STORAGE_DIR, 'profiles')
        if not os.path.exists(p_dir):
            os.makedirs(p_dir)
        return os.path.join(p_dir, f"{safe_email}.json")

def get_raw_profile_path(email):
    """Get storage path for an email directly without resolving aliases."""
    safe_email = email.lower().strip().replace('@', '_at_').replace('.', '_')
    if BUCKET_NAME:
        return f"profiles/{safe_email}.json"
    else:
        p_dir = os.path.join(LOCAL_STORAGE_DIR, 'profiles')
        if not os.path.exists(p_dir):
            os.makedirs(p_dir)
        return os.path.join(p_dir, f"{safe_email}.json")

def load_raw_profile(email):
    """Load profile directly for an email without resolving aliases."""
    try:
        path = get_raw_profile_path(email)
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            if blob.exists():
                return json.loads(blob.download_as_text())
        else:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    return json.load(f)
    except Exception as e:
        logger.error(f"Error loading raw profile for {email}: {e}")
    return None

def load_judge_profile(email):
    """Load a judge's global profile (paradigm and history)."""
    try:
        path = get_profile_path(email)
        data = {"paradigm": "", "history": []}
        
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            if not blob.exists():
                # Check for legacy paradigm file
                legacy_path = f"paradigms/{email.lower().replace('@', '_at_').replace('.', '_')}.json"
                legacy_blob = bucket.blob(legacy_path)
                if legacy_blob.exists():
                    data["paradigm"] = legacy_blob.download_as_text()
                return data
            data_str = blob.download_as_text()
        else:
            if not os.path.exists(path):
                # Check for legacy paradigm file
                legacy_path = os.path.join(LOCAL_STORAGE_DIR, 'paradigms', f"{email.lower().replace('@', '_at_').replace('.', '_')}.json")
                if os.path.exists(legacy_path):
                    with open(legacy_path, 'r') as f:
                        data["paradigm"] = f.read()
                return data
            with open(path, 'r') as f:
                data_str = f.read()
                
        loaded = json.loads(data_str)
        if isinstance(loaded, dict):
            return loaded
        return data
    except Exception as e:
        logger.error(f"Error loading profile for {email}: {e}")
        return {"paradigm": "", "history": []}

def save_judge_profile(email, profile):
    """Save a judge's global profile."""
    try:
        path = get_profile_path(email)
        data_str = json.dumps(profile, indent=2)
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            blob.upload_from_string(data_str, content_type='application/json')
        else:
            with open(path, 'w') as f:
                f.write(data_str)
        return True
    except Exception as e:
        logger.error(f"Error saving profile for {email}: {e}")
        return False

def append_to_judge_history(email, record):
    """Append a match record to the judge's lifetime history."""
    profile = load_judge_profile(email)
    
    # Check for duplicate (same tournament and match_id)
    for existing in profile.get('history', []):
        if (existing.get('tournament_id') == record.get('tournament_id') and 
            existing.get('match_id') == record.get('match_id')):
            # Update existing instead of appending
            existing.update(record)
            return save_judge_profile(email, profile)
            
    if 'history' not in profile:
        profile['history'] = []
    profile['history'].append(record)
    return save_judge_profile(email, profile)

# Monkey patch tournament_manager to use GCS instead of local file
# Note: Since the monkey-patch interface in tournament_manager 
# doesn't support passing tournament_id, we'll need to handle that 
# in the route handlers directly or update tournament_manager.js/py.
# For now, we'll make these dynamic or just stop using these wrappers 
# and call the GCS functions directly in the routes for more control.

def patched_load_tournament_with_id(tournament_id):
    data = load_tournament_from_gcs(tournament_id)
    if not data:
        return {}, []
    return tm._reconstruct_teams(data)

def patched_save_tournament_with_id(data, teams, tournament_id):
    data['teams'] = [asdict(t) for t in teams]
    return save_tournament_to_gcs(data, tournament_id)

# We'll leave the old ones for compatibility during migration if needed, 
# but we should move to the ID-aware versions.
tm.load_tournament_impl = lambda: patched_load_tournament_with_id(DEFAULT_TOURNAMENT_ID)
tm.save_tournament_impl = lambda data, teams: patched_save_tournament_with_id(data, teams, DEFAULT_TOURNAMENT_ID)


def verify_google_token(token):
    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_OAUTH_CLIENT_ID)
        return idinfo
    except ValueError:
        logger.error("Invalid Google OAuth token")
        return None

def require_auth(allowed_roles=None):
    """
    Decorator for verifying Google OAuth tokens and enforcing roles.
    If GOOGLE_OAUTH_CLIENT_ID is not set, auth is bypassed (for easy local testing).
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not GOOGLE_OAUTH_CLIENT_ID:
                dev_email = request.headers.get('X-User-Email')
                if dev_email:
                    request.user_info = {'email': dev_email.lower().strip(), 'name': dev_email.split('@')[0]}
                else:
                    logger.warning("GOOGLE_OAUTH_CLIENT_ID NOT SET. Auth verification is BYPASSED. user_info will be None.")
                    request.user_info = None
                return f(*args, **kwargs)
                
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                 logger.warning("Missing or invalid Authorization header in request")
                 return jsonify({"error": "Unauthorized: Missing or invalid Authorization header"}), 401
                 
            token = auth_header.split(' ')[1]
            user_info = verify_google_token(token)
            if not user_info:
                 logger.error("Token verification failed")
                 return jsonify({"error": "Unauthorized: Invalid token"}), 401
                 
            user_email = user_info.get('email').lower()
            
            if allowed_roles:
                tournament_id = kwargs.get('tournament_id')
                if not tournament_id:
                    return jsonify({"error": "Bad Request: No tournament_id in path"}), 400
                    
                data, _ = patched_load_tournament_with_id(tournament_id)
                if not data:
                    return jsonify({"error": "Not Found: Tournament does not exist"}), 404
                
                # Super Admin bypass: Global administrative access across all tournaments
                if is_super_admin(user_email):
                    request.user_info = user_info
                    return f(*args, **kwargs)

                # Pending tournament check:
                # Disallow modifying, pairing, reporting, or registering teams for unapproved tournaments
                if data.get('status') == 'pending' and request.endpoint in ['pair_round', 'report_result', 'register_team_endpoint', 'add_judge_endpoint', 'assign_judge', 'add_coach_endpoint']:
                    return jsonify({"error": "Forbidden: Tournament is pending approval by Super Admin"}), 403

                auth_data = data.get('auth', {})
                admin_emails = [e.lower() for e in auth_data.get('admins', [])]
                judge_emails = [e.lower() for e in auth_data.get('judges', {}).values()]
                
                has_role = False
                
                if 'admin' in allowed_roles:
                    if user_email in admin_emails:
                        has_role = True
                        
                if 'judge' in allowed_roles and not has_role:
                    if user_email in judge_emails:
                        has_role = True
                
                if 'coach' in allowed_roles and not has_role:
                    coach_mapping = auth_data.get('coaches', {})
                    if user_email in coach_mapping:
                        has_role = True

                if not has_role:
                     logger.warning(f"Access Denied for {user_email}. Required roles: {allowed_roles}")
                     return jsonify({"error": f"Forbidden: Requires roles {allowed_roles}"}), 403
                     
            request.user_info = user_info
            return f(*args, **kwargs)
        return decorated_function
    return decorator


@app.route('/', methods=['GET'])
def serve_frontend():
    """Serve the frontend index.html."""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>', methods=['GET'])
def serve_static(path):
    """Serve static files from the frontend directory."""
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/health', methods=['GET'])
def health_check():
    logger.info("Health check requested")
    return jsonify({"status": "ok"}), 200

@app.route('/api/tournaments', methods=['GET'])
def list_tournaments():
    """List all available tournaments by scanning GCS buckets or local storage."""
    try:
        tournament_ids = []
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            # List blobs with delimiter to find "folders" under tournaments/
            blobs = client.list_blobs(BUCKET_NAME, prefix="tournaments/", delimiter="/")
            
            # Consume the iterator to get prefixes
            list(blobs) 
            prefixes = blobs.prefixes
            
            for p in prefixes:
                # p is like "tournaments/id/"
                t_id = p.split('/')[-2]
                tournament_ids.append(t_id)
        else:
            # Local storage scanning
            if os.path.exists(LOCAL_STORAGE_DIR):
                for t_id in os.listdir(LOCAL_STORAGE_DIR):
                    t_dir = os.path.join(LOCAL_STORAGE_DIR, t_id)
                    t_file = os.path.join(t_dir, 'tournament.json')
                    if os.path.isdir(t_dir) and os.path.exists(t_file):
                        tournament_ids.append(t_id)
            
        if not tournament_ids and load_tournament_from_gcs(DEFAULT_TOURNAMENT_ID):
            tournament_ids = [DEFAULT_TOURNAMENT_ID]
            
        tournaments_data = []
        for t_id in tournament_ids:
            data, _ = patched_load_tournament_with_id(t_id)
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
                "requested_by": requested_by
            })
            
        return jsonify({"tournaments": tournaments_data}), 200
    except Exception as e:
        logger.error(f"Error listing tournaments: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/init', methods=['POST'])
@require_auth()
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
        
        # Create initial data structure (can start with 0 teams for open registration)
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
        user_email = user_info.get('email', '').lower() if user_info else ''
        
        # Super admin or offline local dev mode auto-approves. Regular users require Super Admin approval.
        auto_approve = not GOOGLE_OAUTH_CLIENT_ID or is_super_admin(user_email)
        status = 'approved' if auto_approve else 'pending'

        actual_num_teams = len(teams)
        data = {
            "config": {
                "num_teams": actual_num_teams,
                "num_prelim_rounds": rounds,
                "num_elim_rounds": elim_rounds,
                "num_rounds": rounds + elim_rounds,
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
                "judge_requests": {}
            },
            "team_requests": {}
        }
        
        if save_tournament_to_gcs(data, tournament_id):
            logger.info(f"Tournament {tournament_id} initialized with status {status} and {actual_num_teams} teams")
            log_event(
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
                    "team_requests": data.get("team_requests", {})
                },
                tournament_id=tournament_id,
                actor=user_email or 'system'
            )
            msg = "Tournament initialized" if auto_approve else "Tournament creation request submitted and pending super admin approval"
            return jsonify({"message": msg, "status": status, "config": data['config']}), 200
        else:
            logger.error(f"Failed to save tournament {tournament_id} to GCS during init")
            return jsonify({"error": "Failed to save tournament data"}), 500
            
    except Exception as e:
        logger.error(f"Error in init for {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/data', methods=['GET'])
def get_data(tournament_id):
    """Get full tournament data (for syncing)."""
    logger.info(f"Data sync requested for {tournament_id}")
    data = load_tournament_from_gcs(tournament_id)
    if data:
        logger.info(f"Tournament data for {tournament_id} found and returned")
        response = jsonify(data)
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response, 200
    else:
        logger.warning(f"No tournament data found for {tournament_id} in GCS")
        return jsonify({"error": "No tournament found"}), 404

@app.route('/api/t/<tournament_id>/judge', methods=['POST', 'DELETE'])
@require_auth(allowed_roles=['admin'])
def manage_judge(tournament_id):
    """Add or remove a judge."""
    try:
        data, teams = patched_load_tournament_with_id(tournament_id)
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
            new_judge = {
                "id": judge_id,
                "name": name,
                "institution": institution,
                "email": email,
                "matches_judged": []
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
            
            if patched_save_tournament_with_id(data, teams, tournament_id):
                log_event(
                    action="JUDGE_ADDED",
                    payload={"judge": new_judge},
                    tournament_id=tournament_id,
                    actor=get_current_actor()
                )
                return jsonify({"message": "Judge added", "judge": new_judge}), 200
            else:
                return jsonify({"error": "Failed to save judge"}), 500
                
        elif request.method == 'DELETE':
            judge_id = request.json.get('judge_id')
            if judge_id is None:
                return jsonify({"error": "Missing judge_id"}), 400
                
            data['judges'] = [j for j in data['judges'] if j.get('id') != judge_id]
            
            if 'auth' in data and 'judges' in data['auth']:
                data['auth']['judges'].pop(str(judge_id), None)
            
            if patched_save_tournament_with_id(data, teams, tournament_id):
                log_event(
                    action="JUDGE_REMOVED",
                    payload={"judge_id": judge_id},
                    tournament_id=tournament_id,
                    actor=get_current_actor()
                )
                return jsonify({"message": f"Judge {judge_id} removed"}), 200
            else:
                return jsonify({"error": "Failed to save judge removal"}), 500

    except Exception as e:
        logger.error(f"Error managing judge: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/assign_judge', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def assign_judge(tournament_id):
    """Assign or unassign a judge from a match."""
    try:
        req_data = request.json
        match_id = req_data.get('match_id')
        judge_id = req_data.get('judge_id')
        
        if match_id is None:
            return jsonify({"error": "Missing match_id"}), 400
            
        data, teams = patched_load_tournament_with_id(tournament_id)
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
                
        if new_judge_id is not None:
            new_judge = next((j for j in data.get('judges', []) if j.get('id') == new_judge_id), None)
            if not new_judge:
                return jsonify({"error": f"Judge {new_judge_id} not found"}), 404
            if match_id not in new_judge.setdefault('matches_judged', []):
                new_judge['matches_judged'].append(match_id)
                
        match['judge_id'] = new_judge_id

        if patched_save_tournament_with_id(data, teams, tournament_id):
            log_event(
                action="JUDGE_ASSIGNED",
                payload={"match_id": match_id, "judge_id": new_judge_id},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({"message": f"Judge assignment updated for match {match_id}"}), 200
        else:
            return jsonify({"error": "Failed to save judge assignment"}), 500
            
    except Exception as e:
        logger.error(f"Error assigning judge: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/pair', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def pair_round(tournament_id):
    """Pair the next round."""
    try:
        req_data = request.json
        round_num = req_data.get('round')
        
        if not round_num:
             return jsonify({"error": "Missing round number"}), 400
        
        data, teams = patched_load_tournament_with_id(tournament_id)
        if not data:
             return jsonify({"error": "No tournament found"}), 404
             
        if data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and finalized"}), 403
            
        if round_num == 1:
            if len(teams) < 2:
                return jsonify({"error": f"Cannot pair Round 1: At least 2 teams required to start tournament (currently registered: {len(teams)})"}), 400
            data['is_started'] = True

        try:
            pairs = tm.pair_round_logic(data, teams, round_num)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
            
        new_matches = []
        next_match_id = data.get('next_match_id', 1)
        
        for p in pairs:
            if len(p) == 1:
                m = {
                    "match_id": next_match_id,
                    "round_num": round_num,
                    "aff_id": p[0].id,
                    "neg_id": -1,
                    "aff_name": p[0].name,
                    "neg_name": "BYE",
                    "result": "A",
                    "judge_id": -1,
                    "speaker_points": None
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
                    "speaker_points": None
                }
            new_matches.append(m)
            next_match_id += 1
            
        data['matches'].extend(new_matches)
        data['rounds'].append([m['match_id'] for m in new_matches])
        data['next_match_id'] = next_match_id
        data['current_round'] = round_num
        data['is_started'] = True
        
        if patched_save_tournament_with_id(data, teams, tournament_id):
            log_event(
                action="ROUND_PAIRED",
                payload={"round_num": round_num, "matches": new_matches},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({"message": f"Round {round_num} paired", "matches": new_matches}), 200
        else:
            return jsonify({"error": "Failed to save pairings"}), 500
            
    except Exception as e:
        logger.error(f"Error in pair: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/start', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def start_tournament_endpoint(tournament_id):
    """Admin starts the tournament, closing registration and optionally pairing Round 1."""
    try:
        data, teams_objs = patched_load_tournament_with_id(tournament_id)
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
                next_match_id = data.get('next_match_id', 1)
                for p in pairs:
                    if len(p) == 1:
                        m = {
                            "match_id": next_match_id,
                            "round_num": 1,
                            "aff_id": p[0].id,
                            "neg_id": -1,
                            "aff_name": p[0].name,
                            "neg_name": "BYE",
                            "result": "A",
                            "judge_id": -1,
                            "speaker_points": None
                        }
                    else:
                        m = {
                            "match_id": next_match_id,
                            "round_num": 1,
                            "aff_id": p[0].id,
                            "neg_id": p[1].id,
                            "aff_name": p[0].name,
                            "neg_name": p[1].name,
                            "result": None,
                            "judge_id": -1,
                            "speaker_points": None
                        }
                    new_matches.append(m)
                    next_match_id += 1
                data.setdefault('matches', []).extend(new_matches)
                data.setdefault('rounds', []).append([m['match_id'] for m in new_matches])
                data['next_match_id'] = next_match_id
                data['current_round'] = 1
            except Exception as e:
                return jsonify({"error": f"Error pairing Round 1: {str(e)}"}), 400

        if patched_save_tournament_with_id(data, teams_objs, tournament_id):
            log_event(
                action="TOURNAMENT_STARTED",
                payload={"started_at": datetime.utcnow().isoformat(), "num_teams": len(teams_objs), "matches": new_matches},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({
                "message": f"Tournament started with {len(teams_objs)} teams. Registration is now closed.",
                "is_started": True,
                "matches": new_matches
            }), 200
        return jsonify({"error": "Failed to save tournament state"}), 500

    except Exception as e:
        logger.error(f"Error starting tournament {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/report', methods=['POST'])
@require_auth(allowed_roles=['admin', 'judge'])
def report_result(tournament_id):
    """Report a match result."""
    try:
        req_data = request.json
        match_id = req_data.get('match_id')
        result = req_data.get('result') # 'A' or 'N'
        judge_id = req_data.get('judge_id')
        speaker_points = req_data.get('speaker_points') # Optional dict
        
        if not match_id:
            return jsonify({"error": "Missing match_id"}), 400
            
        data, teams = patched_load_tournament_with_id(tournament_id)
        if not data:
             return jsonify({"error": "No tournament found"}), 404
        
        if data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and results are finalized"}), 403

        # Find match
        match = next((m for m in data['matches'] if m['match_id'] == match_id), None)
        if not match:
            return jsonify({"error": f"Match {match_id} not found"}), 404
            
        # Check specific judge assignment if user is not admin
        user_info = getattr(request, 'user_info', None)
        if user_info and GOOGLE_OAUTH_CLIENT_ID:
            user_email = user_info.get('email')
            auth_data = data.get('auth', {})
            is_admin = user_email in auth_data.get('admins', [])
            if not is_admin:
                my_judge_id = None
                for j_idx, j_email in auth_data.get('judges', {}).items():
                    if j_email == user_email:
                        my_judge_id = int(j_idx)
                        break
                if my_judge_id is None or my_judge_id != match.get('judge_id'):
                    return jsonify({"error": "Forbidden: You are not assigned to this match"}), 403
            
        # Update match
        match['result'] = result
        if judge_id is not None:
            match['judge_id'] = judge_id
        if speaker_points:
            match['speaker_points'] = speaker_points
            
        # Recalculate stats
        team_map = {t.id: t for t in teams}
        tm.recalculate_stats(data, teams, team_map)
        
        if patched_save_tournament_with_id(data, teams, tournament_id):
            log_event(
                action="BALLOT_REPORTED",
                payload={
                    "match_id": match_id,
                    "result": result,
                    "judge_id": judge_id,
                    "speaker_points": speaker_points
                },
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({"message": f"Reported result for Match {match_id}"}), 200
        else:
            return jsonify({"error": "Failed to save result"}), 500

    except Exception as e:
        logger.error(f"Error in report: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/reset', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def reset_tournament(tournament_id):
    """Clear tournament data from storage (GCS or Local) for a specific tournament."""
    logger.info(f"Tournament reset requested for {tournament_id} via /api/t/id/reset")
    try:
        data, _ = patched_load_tournament_with_id(tournament_id)
        if data and data.get('is_closed'):
            return jsonify({"error": "Forbidden: Tournament is closed and cannot be reset"}), 403

        path = get_blob_path(tournament_id)
        
        if BUCKET_NAME:
            client = get_storage_client()
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(path)
            
            if blob.exists():
                blob.delete()
                logger.info(f"Tournament {tournament_id} data SUCCESSFULLY deleted from GCS")
                log_event(
                    action="TOURNAMENT_RESET",
                    payload={"reset": True},
                    tournament_id=tournament_id,
                    actor=get_current_actor()
                )
                return jsonify({"message": f"Tournament {tournament_id} data cleared"}), 200
            else:
                logger.warning(f"Tournament data blob NOT FOUND for {tournament_id} during reset request")
                return jsonify({"message": "No tournament data found to clear"}), 200
        else:
            # Local storage cleanup
            if os.path.exists(path):
                os.remove(path)
                # Also try to remove the directory if empty
                t_dir = os.path.dirname(path)
                try:
                    os.rmdir(t_dir)
                except OSError:
                    pass # Not empty or other error, fine
                logger.info(f"Tournament {tournament_id} data SUCCESSFULLY deleted from Local Storage")
                log_event(
                    action="TOURNAMENT_RESET",
                    payload={"reset": True},
                    tournament_id=tournament_id,
                    actor=get_current_actor()
                )
                return jsonify({"message": f"Tournament {tournament_id} data cleared"}), 200
            else:
                logger.warning(f"Tournament data file NOT FOUND for {tournament_id} during local reset request")
                return jsonify({"message": "No tournament data found to clear"}), 200
            
    except Exception as e:
        logger.error(f"Error in reset for {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/judge_profile/<email>', methods=['GET'])
@app.route('/api/profile/<email>', methods=['GET'])
def get_judge_profile_endpoint(email):
    """Get global profile for a specific email."""
    profile = load_judge_profile(email)
    return jsonify(profile), 200

@app.route('/api/judge_profile', methods=['POST'])
@app.route('/api/profile', methods=['POST'])
@require_auth()
def update_judge_profile_endpoint():
    """Update paradigm in profile for the authenticated user."""
    if not request.user_info:
        return jsonify({"error": "Unauthorized: No user info"}), 401
    
    user_email = request.user_info.get('email').lower()
    data = request.json
    paradigm_text = data.get('paradigm', '')
    
    profile = load_judge_profile(user_email)
    profile['paradigm'] = paradigm_text
    
    if save_judge_profile(user_email, profile):
        log_event(
            action="PARADIGM_UPDATED",
            payload={"email": user_email, "paradigm": paradigm_text},
            actor=user_email
        )
        return jsonify({"message": "Profile updated successfuly"}), 200
    else:
        return jsonify({"error": "Failed to save profile"}), 500

@app.route('/api/user/link_email', methods=['POST'])
@app.route('/api/link_email', methods=['POST'])
@require_auth()
def link_email_endpoint():
    """Link a secondary email to the authenticated user's primary profile."""
    if not request.user_info:
        return jsonify({"error": "Unauthorized"}), 401
    
    primary_email = request.user_info.get('email').lower().strip()
    data = request.json
    secondary_email = data.get('secondary_email', '').lower().strip()
    
    if not secondary_email or secondary_email == primary_email:
        return jsonify({"error": "Invalid secondary email"}), 400
        
    aliases = load_aliases()
    if secondary_email in aliases and aliases[secondary_email] != primary_email:
        return jsonify({"error": f"Email {secondary_email} is already linked to another account"}), 400
    
    # 1. Load secondary profile before aliasing to merge existing records
    secondary_profile = load_raw_profile(secondary_email)

    # 2. Update Global Aliases
    aliases[secondary_email] = primary_email
    if not save_aliases(aliases):
        return jsonify({"error": "Failed to save alias mapping"}), 500
        
    # 3. Update Primary Profile
    profile = load_judge_profile(primary_email)
    if 'aliases' not in profile:
        profile['aliases'] = []
    if secondary_email not in profile['aliases']:
        profile['aliases'].append(secondary_email)
        
    # 4. Merge existing history and paradigm from secondary if it exists
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
    
    if save_judge_profile(primary_email, profile):
        log_event(
            action="EMAIL_LINKED",
            payload={"primary_email": primary_email, "secondary_email": secondary_email},
            actor=primary_email
        )
        return jsonify({"message": f"Successfully linked {secondary_email} to {primary_email}", "profile": profile}), 200
    else:
        return jsonify({"error": "Failed to update profile"}), 500

@app.route('/api/t/<tournament_id>/close', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def close_tournament_endpoint(tournament_id):
    """Finalize tournament and commit all judge histories."""
    try:
        data, teams = patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404
            
        if data.get('is_closed'):
            return jsonify({"error": "Tournament is already closed"}), 400

        # 1. Aggregate history for all judges
        judges_data = data.get('judges', [])
        matches = data.get('matches', [])
        updated_count = 0
        
        # Build dictionary for quick judge lookup
        judges_dict = {j.get('id'): j for j in judges_data}
        
        # Track history records per judge
        judge_history_commits = {} # email -> list of records
        
        for m in matches:
            judge_id = m.get('judge_id')
            if not judge_id or not m.get('result'):
                continue
                
            judge = judges_dict.get(judge_id)
            if not judge or not judge.get('email'):
                continue
                
            email = judge.get('email').lower()
            if email not in judge_history_commits:
                judge_history_commits[email] = []
                
            judge_history_commits[email].append({
                "tournament_id": tournament_id,
                "tournament_name": data.get('tournamentId', tournament_id),
                "match_id": m.get('match_id'),
                "round_num": m.get('round_num'),
                "aff_team": m.get('aff_name'),
                "neg_team": m.get('neg_name'),
                "result": m.get('result'),
                "date": datetime.now().strftime("%Y-%m-%d %H:%M")
            })

        for email, records in judge_history_commits.items():
            success = False
            for record in records:
                if append_to_judge_history(email, record):
                    success = True
            if success:
                updated_count += 1

        # 2. Aggregate history for all participants (debaters)
        participant_updated_count = 0
        teams_data = data.get('teams', [])
        
        for team in teams_data:
            institution = team.get('institution', 'Unknown')
            team_name = team.get('name', 'Unknown')
            team_id = team.get('id')
            members = team.get('members', [])
            
            # Find matches for this team
            team_matches = [m for m in matches if (m.get('aff_id') == team_id or m.get('neg_id') == team_id) and m.get('result')]
            
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
                    
                    # Result from perspective of this team
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
                        "date": datetime.now().strftime("%Y-%m-%d %H:%M")
                    })
                
                if member_records:
                    profile = load_judge_profile(member_email)
                    if 'history' not in profile:
                        profile['history'] = []
                    
                    # Filter existing participation records for this tournament
                    profile['history'] = [r for r in profile['history'] if not (r.get('tournament_id') == tournament_id and r.get('type') == 'participation')]
                    profile['history'].extend(member_records)
                    
                    if save_judge_profile(member_email, profile):
                        participant_updated_count += 1

        # Mark tournament as closed
        data['is_closed'] = True
        if patched_save_tournament_with_id(data, teams, tournament_id):
            log_event(
                action="TOURNAMENT_CLOSED",
                payload={"is_closed": True},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({
                "message": f"Tournament closed. {updated_count} judge and {participant_updated_count} participant profiles updated.",
                "updated_judges": updated_count,
                "updated_participants": participant_updated_count
            }), 200
        else:
            return jsonify({"error": "Failed to save tournament closure"}), 500

    except Exception as e:
        logger.error(f"Error closing tournament {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500
@app.route('/api/t/<tournament_id>/register_team', methods=['POST'])
@require_auth(allowed_roles=['admin', 'coach'])
def register_team_endpoint(tournament_id):
    """Allow coaches or admins to register a team."""
    try:
        user_info = getattr(request, 'user_info', None)
        user_email = user_info.get('email', '').lower() if user_info else ""
        
        data, teams_objs = patched_load_tournament_with_id(tournament_id)
        if not data:
            return jsonify({"error": "Tournament not found"}), 404
            
        if data.get('is_closed'):
            return jsonify({"error": "Tournament is closed"}), 403

        auth_data = data.get('auth', {})
        admin_emails = [e.lower() for e in auth_data.get('admins', [])]
        coach_mapping = auth_data.get('coaches', {})
        
        is_admin = user_email in admin_emails
        coach_institution = coach_mapping.get(user_email)

        # Parse team from request
        req_data = request.json
        team_id = req_data.get('id')
        team_name = req_data.get('name')
        institution = req_data.get('institution')
        members = req_data.get('members', [])

        if not team_name or not institution:
            return jsonify({"error": "Team name and institution are required"}), 400

        # Security Check: Coaches can only add for their institution
        if not is_admin:
            if not coach_institution or institution != coach_institution:
                return jsonify({"error": f"Unauthorized: You can only register teams for {coach_institution}"}), 403

        # Validation: cannot register new teams once tournament has started or matches have been generated
        if team_id is None and (data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0)):
            return jsonify({"error": "Registration is closed: Cannot register new teams after tournament has started or preliminary rounds have been paired"}), 400

        # Add or update team
        if team_id is not None:
            # Update existing
            existing_team = next((t for t in teams_objs if t.id == team_id), None)
            if existing_team:
                if not is_admin and existing_team.institution != coach_institution:
                     return jsonify({"error": "Unauthorized: Cannot edit team from another institution"}), 403
                existing_team.name = team_name
                existing_team.institution = institution
                # Update members (handle emails)
                existing_team.members = members
            else:
                return jsonify({"error": "Team ID not found"}), 404
        else:
            # New team
            max_id = max([t.id for t in teams_objs] + [-1])
            new_team = tm.Team(id=max_id + 1, name=team_name, institution=institution, members=members)
            teams_objs.append(new_team)
            if 'config' in data and isinstance(data['config'], dict):
                data['config']['num_teams'] = len(teams_objs)

        if patched_save_tournament_with_id(data, teams_objs, tournament_id):
            registered_team = existing_team if team_id is not None else new_team
            log_event(
                action="TEAM_REGISTERED",
                payload={"team": asdict(registered_team)},
                tournament_id=tournament_id,
                actor=user_email or get_current_actor()
            )
            return jsonify({"message": "Team registered successfully", "team_id": team_id if team_id is not None else (new_team.id if 'new_team' in locals() else 0)}), 200
        else:
            return jsonify({"error": "Failed to save tournament data"}), 500

    except Exception as e:
        logger.error(f"Error registering team: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/coaches', methods=['GET'])
@require_auth(allowed_roles=['admin'])
def get_coaches_endpoint(tournament_id):
    """Get all registered coaches and their institutions for a tournament."""
    data, _ = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    auth_data = data.get('auth', {})
    coaches = auth_data.get('coaches', {})
    return jsonify({"coaches": coaches}), 200

@app.route('/api/t/<tournament_id>/coaches', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def add_coach_endpoint(tournament_id):
    """Add or update a coach's school assignment."""
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    req = request.json or {}
    email = req.get('email', '').lower().strip()
    institution = req.get('institution', '').strip()
    if not email or not institution:
        return jsonify({"error": "Both email and institution are required"}), 400
    
    if 'auth' not in data:
        data['auth'] = {'admins': [], 'judges': {}, 'coaches': {}}
    if 'coaches' not in data['auth']:
        data['auth']['coaches'] = {}
        
    data['auth']['coaches'][email] = institution
    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="COACH_ADDED",
            payload={"email": email, "institution": institution},
            tournament_id=tournament_id,
            actor=get_current_actor()
        )
        return jsonify({"message": f"Coach {email} assigned to {institution}", "coaches": data['auth']['coaches']}), 200
    return jsonify({"error": "Failed to save tournament data"}), 500

@app.route('/api/t/<tournament_id>/coaches/<path:coach_email>', methods=['DELETE'])
@require_auth(allowed_roles=['admin'])
def remove_coach_endpoint(tournament_id, coach_email):
    """Remove a coach from a tournament."""
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = coach_email.lower().strip()
    auth_data = data.get('auth', {})
    if 'coaches' in auth_data and email in auth_data['coaches']:
        del auth_data['coaches'][email]
        if patched_save_tournament_with_id(data, teams_objs, tournament_id):
            log_event(
                action="COACH_REMOVED",
                payload={"email": email},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({"message": f"Coach {email} removed", "coaches": auth_data['coaches']}), 200
        return jsonify({"error": "Failed to save tournament data"}), 500
    return jsonify({"error": f"Coach {email} not found"}), 404

@app.route('/api/t/<tournament_id>/coach_requests', methods=['POST'])
@require_auth()
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

    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    if data.get('is_closed'):
        return jsonify({"error": "Tournament is closed"}), 403

    if 'auth' not in data:
        data['auth'] = {'admins': [], 'judges': {}, 'coaches': {}, 'coach_requests': {}}
    if 'coach_requests' not in data['auth']:
        data['auth']['coach_requests'] = {}

    data['auth']['coach_requests'][email] = {
        'email': email,
        'name': name,
        'institution': institution,
        'requested_at': datetime.utcnow().isoformat()
    }

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="COACH_REQUESTED",
            payload=data['auth']['coach_requests'][email],
            tournament_id=tournament_id,
            actor=email
        )
        return jsonify({
            "message": f"Coach request for {institution} submitted successfully",
            "request": data['auth']['coach_requests'][email]
        }), 200
    return jsonify({"error": "Failed to save coach request"}), 500

@app.route('/api/t/<tournament_id>/coach_requests', methods=['GET'])
@require_auth(allowed_roles=['admin'])
def get_coach_requests_endpoint(tournament_id):
    """List all pending coach requests for a tournament (Admin only)."""
    data, _ = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    auth_data = data.get('auth', {})
    coach_requests = auth_data.get('coach_requests', {})
    return jsonify({"coach_requests": coach_requests}), 200

@app.route('/api/t/<tournament_id>/coach_requests/<path:coach_email>/approve', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def approve_coach_request_endpoint(tournament_id, coach_email):
    """Approve a pending coach request and grant them coach privileges (Admin only)."""
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = coach_email.lower().strip()
    auth_data = data.get('auth', {})
    requests = auth_data.get('coach_requests', {})
    
    if email not in requests:
        return jsonify({"error": f"No pending coach request found for {email}"}), 404

    req_entry = requests.pop(email)
    institution = req_entry.get('institution')

    if 'coaches' not in auth_data:
        auth_data['coaches'] = {}
    auth_data['coaches'][email] = institution

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="COACH_APPROVED",
            payload={"email": email, "institution": institution},
            tournament_id=tournament_id,
            actor=get_current_actor()
        )
        return jsonify({
            "message": f"Coach {email} approved for {institution}",
            "coaches": auth_data['coaches'],
            "coach_requests": requests
        }), 200
    return jsonify({"error": "Failed to save tournament data"}), 500

@app.route('/api/t/<tournament_id>/coach_requests/<path:coach_email>/reject', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def reject_coach_request_endpoint(tournament_id, coach_email):
    """Reject and remove a pending coach request (Admin only)."""
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = coach_email.lower().strip()
    auth_data = data.get('auth', {})
    requests = auth_data.get('coach_requests', {})

    if email in requests:
        del requests[email]
        if patched_save_tournament_with_id(data, teams_objs, tournament_id):
            log_event(
                action="COACH_REJECTED",
                payload={"email": email},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({
                "message": f"Coach request for {email} rejected",
                "coach_requests": requests
            }), 200
        return jsonify({"error": "Failed to save tournament data"}), 500
    return jsonify({"error": f"No pending request found for {email}"}), 404

@app.route('/api/t/<tournament_id>/judge_requests', methods=['POST'])
@require_auth()
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

    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    if data.get('is_closed'):
        return jsonify({"error": "Tournament is closed"}), 403

    if 'auth' not in data:
        data['auth'] = {'admins': [], 'judges': {}, 'coaches': {}, 'coach_requests': {}, 'judge_requests': {}}
    if 'judge_requests' not in data['auth']:
        data['auth']['judge_requests'] = {}

    data['auth']['judge_requests'][email] = {
        'email': email,
        'name': name,
        'institution': institution,
        'paradigm': paradigm,
        'requested_at': datetime.utcnow().isoformat()
    }

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="JUDGE_REQUESTED",
            payload=data['auth']['judge_requests'][email],
            tournament_id=tournament_id,
            actor=email
        )
        return jsonify({
            "message": "Judge application submitted successfully",
            "request": data['auth']['judge_requests'][email]
        }), 200
    return jsonify({"error": "Failed to save judge request"}), 500

@app.route('/api/t/<tournament_id>/judge_requests', methods=['GET'])
@require_auth(allowed_roles=['admin'])
def get_judge_requests_endpoint(tournament_id):
    """List all pending judge applications for a tournament (Admin only)."""
    data, _ = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    auth_data = data.get('auth', {})
    judge_requests = auth_data.get('judge_requests', {})
    return jsonify({"judge_requests": judge_requests}), 200

@app.route('/api/t/<tournament_id>/judge_requests/<path:judge_email>/approve', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def approve_judge_request_endpoint(tournament_id, judge_email):
    """Approve a pending judge request, allocate judge ID, and add to tournament pool (Admin only)."""
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    if data.get('is_closed'):
        return jsonify({"error": "Tournament is closed"}), 403

    email = judge_email.lower().strip()
    auth_data = data.get('auth', {})
    requests = auth_data.get('judge_requests', {})

    if email not in requests:
        return jsonify({"error": f"No pending judge request found for {email}"}), 404

    req_entry = requests.pop(email)
    name = req_entry.get('name', email)
    institution = req_entry.get('institution', 'Tournament Hire')
    paradigm = req_entry.get('paradigm', '')

    if 'judges' not in data:
        data['judges'] = []
    judge_id = data.get('next_judge_id', 1)
    new_judge = {
        "id": judge_id,
        "name": name,
        "institution": institution,
        "email": email,
        "matches_judged": [],
        "paradigm": paradigm
    }
    data['judges'].append(new_judge)
    data['next_judge_id'] = judge_id + 1

    if 'judges' not in auth_data:
        auth_data['judges'] = {}
    auth_data['judges'][str(judge_id)] = email

    if paradigm:
        if 'paradigms' not in data:
            data['paradigms'] = {}
        data['paradigms'][str(judge_id)] = paradigm

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="JUDGE_APPROVED",
            payload={"judge": new_judge, "email": email},
            tournament_id=tournament_id,
            actor=get_current_actor()
        )
        return jsonify({
            "message": f"Judge {name} ({email}) approved",
            "judge": new_judge,
            "judge_requests": requests
        }), 200
    return jsonify({"error": "Failed to save tournament data"}), 500

@app.route('/api/t/<tournament_id>/judge_requests/<path:judge_email>/reject', methods=['POST'])
@require_auth(allowed_roles=['admin'])
def reject_judge_request_endpoint(tournament_id, judge_email):
    """Reject and remove a pending judge request (Admin only)."""
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    email = judge_email.lower().strip()
    auth_data = data.get('auth', {})
    requests = auth_data.get('judge_requests', {})

    if email in requests:
        del requests[email]
        if patched_save_tournament_with_id(data, teams_objs, tournament_id):
            log_event(
                action="JUDGE_REJECTED",
                payload={"email": email},
                tournament_id=tournament_id,
                actor=get_current_actor()
            )
            return jsonify({
                "message": f"Judge request for {email} rejected",
                "judge_requests": requests
            }), 200
        return jsonify({"error": "Failed to save tournament data"}), 500
    return jsonify({"error": f"No pending request found for {email}"}), 404

@app.route('/api/t/<tournament_id>/team_requests', methods=['POST'])
@require_auth()
def submit_team_request_endpoint(tournament_id):
    """Allow students to submit a team entry under an approved coach for verification."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''
    
    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    if data.get('is_closed'):
        return jsonify({"error": "Tournament is closed"}), 403

    # Cannot register new teams if tournament has started or matches have been paired
    if data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0):
        return jsonify({"error": "Registration is closed. Tournament has already started."}), 400

    req_data = request.json or {}
    team_name = req_data.get('name', '').strip()
    institution = req_data.get('institution', '').strip()
    members = req_data.get('members', [])

    if not team_name or not institution:
        return jsonify({"error": "Team name and institution are required"}), 400

    # Verify that the institution has an approved coach
    auth_data = data.get('auth', {})
    coach_mapping = auth_data.get('coaches', {})
    approved_institutions = {inst.lower(): inst for inst in coach_mapping.values()}
    
    matched_institution = approved_institutions.get(institution.lower())
    if not matched_institution:
        return jsonify({
            "error": f"Institution '{institution}' does not have an approved coach for this tournament. A coach must be approved first before teams can register under it."
        }), 400

    # Canonicalize institution casing from coach mapping
    institution = matched_institution

    if 'team_requests' not in data:
        data['team_requests'] = {}

    import uuid
    req_id = f"tr_{uuid.uuid4().hex[:8]}"
    data['team_requests'][req_id] = {
        'id': req_id,
        'name': team_name,
        'institution': institution,
        'members': members,
        'submitted_by': user_email,
        'submitted_at': datetime.utcnow().isoformat(),
        'status': 'pending_coach_approval'
    }

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="TEAM_REQUESTED",
            payload=data['team_requests'][req_id],
            tournament_id=tournament_id,
            actor=user_email or 'system'
        )
        return jsonify({
            "message": f"Team registration submitted to your {institution} coach for approval",
            "request_id": req_id,
            "request": data['team_requests'][req_id]
        }), 200
    return jsonify({"error": "Failed to save team request"}), 500

@app.route('/api/t/<tournament_id>/team_requests', methods=['GET'])
@require_auth(allowed_roles=['admin', 'coach'])
def get_team_requests_endpoint(tournament_id):
    """List pending team registration requests. Coaches only see requests for their school."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, _ = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404

    auth_data = data.get('auth', {})
    admin_emails = [e.lower() for e in auth_data.get('admins', [])]
    coach_mapping = auth_data.get('coaches', {})
    
    is_admin = is_super_admin(user_email) or (user_email in admin_emails)
    coach_institution = coach_mapping.get(user_email)

    requests = data.get('team_requests', {})
    if is_admin:
        filtered = requests
    else:
        filtered = {k: v for k, v in requests.items() if v.get('institution', '').lower() == (coach_institution or '').lower()}

    return jsonify({"team_requests": filtered}), 200

@app.route('/api/t/<tournament_id>/team_requests/<request_id>/approve', methods=['POST'])
@require_auth(allowed_roles=['admin', 'coach'])
def approve_team_request_endpoint(tournament_id, request_id):
    """Approve a student team registration request and officially add it to the tournament roster."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404
    if data.get('is_closed'):
        return jsonify({"error": "Tournament is closed"}), 403
    if data.get('is_started') or (data.get('matches') and len(data.get('matches')) > 0):
        return jsonify({"error": "Registration is closed. Cannot add new teams after tournament has started."}), 400

    requests = data.get('team_requests', {})
    if request_id not in requests:
        return jsonify({"error": f"Team request {request_id} not found"}), 404

    req_entry = requests[request_id]
    institution = req_entry.get('institution', '')

    auth_data = data.get('auth', {})
    admin_emails = [e.lower() for e in auth_data.get('admins', [])]
    coach_mapping = auth_data.get('coaches', {})
    is_admin = is_super_admin(user_email) or (user_email in admin_emails)
    coach_institution = coach_mapping.get(user_email)

    if not is_admin and institution.lower() != (coach_institution or '').lower():
        return jsonify({"error": f"Unauthorized: You can only approve teams for {coach_institution}"}), 403

    # Add team to tournament
    del requests[request_id]
    max_id = max([t.id for t in teams_objs] + [-1])
    new_team = tm.Team(
        id=max_id + 1,
        name=req_entry['name'],
        institution=institution,
        members=req_entry.get('members', [])
    )
    teams_objs.append(new_team)
    if 'config' in data and isinstance(data['config'], dict):
        data['config']['num_teams'] = len(teams_objs)

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="TEAM_APPROVED",
            payload={"request_id": request_id, "team": asdict(new_team)},
            tournament_id=tournament_id,
            actor=user_email or get_current_actor()
        )
        return jsonify({
            "message": f"Team '{new_team.name}' approved and registered successfully",
            "team_id": new_team.id,
            "team_requests": requests
        }), 200
    return jsonify({"error": "Failed to save team registration"}), 500

@app.route('/api/t/<tournament_id>/team_requests/<request_id>/reject', methods=['POST'])
@require_auth(allowed_roles=['admin', 'coach'])
def reject_team_request_endpoint(tournament_id, request_id):
    """Reject and remove a student team registration request."""
    user_info = getattr(request, 'user_info', None)
    user_email = user_info.get('email', '').lower() if user_info else ''

    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404

    requests = data.get('team_requests', {})
    if request_id not in requests:
        return jsonify({"error": f"Team request {request_id} not found"}), 404

    req_entry = requests[request_id]
    institution = req_entry.get('institution', '')

    auth_data = data.get('auth', {})
    admin_emails = [e.lower() for e in auth_data.get('admins', [])]
    coach_mapping = auth_data.get('coaches', {})
    is_admin = is_super_admin(user_email) or (user_email in admin_emails)
    coach_institution = coach_mapping.get(user_email)

    if not is_admin and institution.lower() != (coach_institution or '').lower():
        return jsonify({"error": f"Unauthorized: You can only reject teams for {coach_institution}"}), 403

    del requests[request_id]
    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="TEAM_REJECTED",
            payload={"request_id": request_id},
            tournament_id=tournament_id,
            actor=user_email or get_current_actor()
        )
        return jsonify({
            "message": "Team registration request rejected",
            "team_requests": requests
        }), 200
    return jsonify({"error": "Failed to save tournament data"}), 500

@app.route('/api/user/super_admin_status', methods=['GET'])
@require_auth()
def get_super_admin_status():
    """Check if current authenticated user is a Super Admin."""
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    return jsonify({
        "email": email,
        "is_super_admin": is_super_admin(email)
    }), 200

@app.route('/api/t/<tournament_id>/approve', methods=['POST'])
@require_auth()
def approve_tournament(tournament_id):
    """Approve a pending tournament request (Super Admin only)."""
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    if not is_super_admin(email) and GOOGLE_OAUTH_CLIENT_ID:
        return jsonify({"error": "Forbidden: Requires Super Admin privileges"}), 403

    data, teams_objs = patched_load_tournament_with_id(tournament_id)
    if not data:
        return jsonify({"error": "Tournament not found"}), 404

    data['status'] = 'approved'
    data['approved_by'] = email if email else 'admin'
    data['approved_at'] = datetime.utcnow().isoformat()

    if patched_save_tournament_with_id(data, teams_objs, tournament_id):
        log_event(
            action="TOURNAMENT_APPROVED",
            payload={"status": "approved", "approved_by": email or "admin"},
            tournament_id=tournament_id,
            actor=email or 'system'
        )
        return jsonify({"message": f"Tournament {tournament_id} approved successfully", "status": "approved"}), 200
    return jsonify({"error": "Failed to save tournament approval"}), 500

@app.route('/api/t/<tournament_id>/reject', methods=['POST'])
@require_auth()
def reject_tournament(tournament_id):
    """Reject and delete a pending tournament request (Super Admin only)."""
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    if not is_super_admin(email) and GOOGLE_OAUTH_CLIENT_ID:
        return jsonify({"error": "Forbidden: Requires Super Admin privileges"}), 403

    path = get_blob_path(tournament_id)
    if BUCKET_NAME:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
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
    log_event(
        action="TOURNAMENT_REJECTED",
        payload={"status": "rejected"},
        tournament_id=tournament_id,
        actor=email or 'system'
    )
    return jsonify({"message": f"Tournament {tournament_id} request rejected and removed"}), 200

@app.route('/api/t/<tournament_id>/events', methods=['GET'])
@require_auth(allowed_roles=['admin'])
def get_tournament_events_endpoint(tournament_id):
    """Retrieve event journal for a specific tournament (Admin/Super Admin only)."""
    events = load_events_from_storage(tournament_id)
    return jsonify({
        "tournament_id": tournament_id,
        "count": len(events),
        "events": events
    }), 200

@app.route('/api/events', methods=['GET'])
@require_auth()
def get_all_events_endpoint():
    """Retrieve central platform event journal (Super Admin only)."""
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    if not is_super_admin(email) and GOOGLE_OAUTH_CLIENT_ID:
        return jsonify({"error": "Forbidden: Requires Super Admin privileges"}), 403
    
    events = load_events_from_storage()
    
    # Optional filtering
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
        "events": events
    }), 200


@app.route('/api/t/<tournament_id>/verify_consistency', methods=['GET'])
@require_auth(allowed_roles=['admin'])
def verify_tournament_consistency_endpoint(tournament_id):
    """Run an automated consistency and rule validation check for a tournament."""
    report = event_replay.verify_storage_consistency(LOCAL_STORAGE_DIR, tournament_id)
    status_code = 200 if report.get('is_consistent') else 409
    return jsonify(report), status_code

@app.route('/api/verify_consistency', methods=['GET'])
@require_auth()
def verify_platform_consistency_endpoint():
    """Run an automated consistency and rule validation check across all tournaments (Super Admin only)."""
    user_info = getattr(request, 'user_info', None)
    email = user_info.get('email', '').lower().strip() if user_info else ''
    if not is_super_admin(email) and GOOGLE_OAUTH_CLIENT_ID:
        return jsonify({"error": "Forbidden: Requires Super Admin privileges"}), 403

    report = event_replay.verify_storage_consistency(LOCAL_STORAGE_DIR)
    status_code = 200 if report.get('is_consistent') else 409
    return jsonify(report), status_code


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    app.run(host='0.0.0.0', port=port, debug=True)
