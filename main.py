import os
import json
import logging
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

def get_profile_path(email):
    """Get storage path for a user's profile."""
    safe_email = email.lower().replace('@', '_at_').replace('.', '_')
    if BUCKET_NAME:
        return f"profiles/{safe_email}.json"
    else:
        p_dir = os.path.join(LOCAL_STORAGE_DIR, 'profiles')
        if not os.path.exists(p_dir):
            os.makedirs(p_dir)
        return os.path.join(p_dir, f"{safe_email}.json")

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
            if data:
                is_closed = data.get('is_closed', False)
                if 'auth' in data and 'admins' in data['auth']:
                    admins = data['auth']['admins']
            tournaments_data.append({"id": t_id, "admins": admins, "is_closed": is_closed})
            
        return jsonify({"tournaments": tournaments_data}), 200
    except Exception as e:
        logger.error(f"Error listing tournaments: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/init', methods=['POST'])
@require_auth()
def init_tournament(tournament_id):
    """Initialize a new tournament."""
    try:
        req_data = request.json
        num_teams = req_data.get('num_teams')
        rounds = req_data.get('rounds')
        elim_rounds = req_data.get('elim_rounds', 0)
        
        if not num_teams or not rounds:
            return jsonify({"error": "Missing num_teams or rounds"}), 400
            
        req_teams = req_data.get('teams', [])
        
        # Create initial data structure
        teams = []
        for i in range(num_teams):
            name = f"Team {i+1}"
            institution = "Unknown"
            members = []
            if i < len(req_teams):
                req_t = req_teams[i]
                name = req_t.get('name', name)
                institution = req_t.get('institution', institution)
                members = req_t.get('members', [])
            
            t_obj = swiss_sim.Team(id=i, true_rank=0, name=name, members=members)
            t_obj.institution = institution
            teams.append(t_obj)
            
        data = {
            "config": {
                "num_teams": num_teams,
                "num_prelim_rounds": rounds,
                "num_elim_rounds": elim_rounds,
                "num_rounds": rounds + elim_rounds,
            },
            "current_round": 0,
            "rounds": [],
            "teams": [asdict(t) for t in teams],
            "matches": [],
            "next_match_id": 1,
            "tournament_id": tournament_id,
            "auth": {
                "admins": []
            }
        }
        
        # Add creator as admin
        user_info = getattr(request, 'user_info', None)
        logger.info(f"init_tournament: user_info identified as: {user_info}")
        if user_info and user_info.get('email'):
            admin_email = user_info.get('email').lower()
            data["auth"]["admins"].append(admin_email)
            logger.info(f"Added {admin_email} as first admin of {tournament_id}")
        else:
            logger.warning(f"Could NOT identify creator for tournament {tournament_id}. Admin list will be EMPTY.")
        
        if save_tournament_to_gcs(data, tournament_id):
            logger.info(f"Tournament {tournament_id} initialized successfully")
            return jsonify({"message": "Tournament initialized", "config": data['config']}), 200
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
                data['auth'] = {'admins': [], 'judges': {}}
            if 'judges' not in data['auth']:
                data['auth']['judges'] = {}
            if email:
                data['auth']['judges'][str(judge_id)] = email
            
            if patched_save_tournament_with_id(data, teams, tournament_id):
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
        
        if patched_save_tournament_with_id(data, teams, tournament_id):
            return jsonify({"message": f"Round {round_num} paired", "matches": new_matches}), 200
        else:
            return jsonify({"error": "Failed to save pairings"}), 500
            
    except Exception as e:
        logger.error(f"Error in pair: {e}")
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
                return jsonify({"message": f"Tournament {tournament_id} data cleared"}), 200
            else:
                logger.warning(f"Tournament data file NOT FOUND for {tournament_id} during local reset request")
                return jsonify({"message": "No tournament data found to clear"}), 200
            
    except Exception as e:
        logger.error(f"Error in reset for {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/judge_profile/<email>', methods=['GET'])
def get_judge_profile_endpoint(email):
    """Get global profile for a specific email."""
    profile = load_judge_profile(email)
    return jsonify(profile), 200

@app.route('/api/judge_profile', methods=['POST'])
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
        return jsonify({"message": "Profile updated successfuly"}), 200
    else:
        return jsonify({"error": "Failed to save profile"}), 500

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

        # Aggregate history for all judges
        judges_data = data.get('judges', [])
        matches = data.get('matches', [])
        
        updated_count = 0
        for judge in judges_data:
            email = judge.get('email')
            if not email:
                continue
                
            judge_id = judge.get('id')
            # Find all matches judged by this judge in this tournament
            judged_matches = [m for m in matches if m.get('judge_id') == judge_id and m.get('result')]
            
            if not judged_matches:
                continue
                
            # Prepare records
            records = []
            for m in judged_matches:
                records.append({
                    "tournament_id": tournament_id,
                    "tournament_name": data.get('tournamentId', tournament_id),
                    "match_id": m.get('match_id'),
                    "round_num": m.get('round_num'),
                    "aff_name": m.get('aff_name'),
                    "neg_name": m.get('neg_name'),
                    "result": m.get('result'),
                    "date": tm.datetime.now().strftime("%Y-%m-%d %H:%M") if hasattr(tm, 'datetime') else ""
                })
            
            # Commit to global profile
            if records:
                profile = load_judge_profile(email)
                if 'history' not in profile:
                    profile['history'] = []
                
                # Filter out existing records for this tournament to avoid duplicates on re-close
                profile['history'] = [r for r in profile['history'] if r.get('tournament_id') != tournament_id]
                profile['history'].extend(records)
                
                if save_judge_profile(email, profile):
                    updated_count += 1

        # Mark tournament as closed
        data['is_closed'] = True
        if patched_save_tournament_with_id(data, teams, tournament_id):
            return jsonify({
                "message": f"Tournament closed. {updated_count} judge profiles updated.",
                "updated_judges": updated_count
            }), 200
        else:
            return jsonify({"error": "Failed to save tournament closure"}), 500

    except Exception as e:
        logger.error(f"Error closing tournament {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    app.run(host='0.0.0.0', port=port, debug=True)
