import os
import json
import logging
from dataclasses import asdict
from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import storage
import tournament_manager as tm
import swiss_sim

app = Flask(__name__)
# Enable CORS for GitHub Pages and local development
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "https://iceboxcoldice.github.io",
            "http://localhost:*",
            "http://127.0.0.1:*"
        ],
        "allow_headers": ["Content-Type"],
        "methods": ["GET", "POST", "OPTIONS"],
        "supports_credentials": False
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# GCS Configuration
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'swiss-tournament-data')
DEFAULT_TOURNAMENT_ID = 'default'

def get_storage_client():
    return storage.Client()

def get_blob_path(tournament_id):
    """Get the GCS blob path for a specific tournament."""
    if not tournament_id:
        tournament_id = DEFAULT_TOURNAMENT_ID
    return f"tournaments/{tournament_id}/tournament.json"

def load_tournament_from_gcs(tournament_id=DEFAULT_TOURNAMENT_ID):
    """Load tournament data from GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob_path = get_blob_path(tournament_id)
        blob = bucket.blob(blob_path)
        
        if not blob.exists():
            return None
            
        data_str = blob.download_as_text()
        return json.loads(data_str)
    except Exception as e:
        logger.error(f"Error loading {tournament_id} from GCS: {e}")
        return None

def save_tournament_to_gcs(data, tournament_id=DEFAULT_TOURNAMENT_ID):
    """Save tournament data to GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob_path = get_blob_path(tournament_id)
        blob = bucket.blob(blob_path)
        
        blob.upload_from_string(json.dumps(data, indent=2), content_type='application/json')
        return True
    except Exception as e:
        logger.error(f"Error saving {tournament_id} to GCS: {e}")
        return False

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


@app.route('/api/health', methods=['GET'])
def health_check():
    logger.info("Health check requested")
    return jsonify({"status": "ok"}), 200

@app.route('/api/tournaments', methods=['GET'])
def list_tournaments():
    """List all available tournaments by scanning GCS buckets."""
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        # List blobs with delimiter to find "folders" under tournaments/
        blobs = client.list_blobs(BUCKET_NAME, prefix="tournaments/", delimiter="/")
        
        # Consume the iterator to get prefixes
        list(blobs) 
        prefixes = blobs.prefixes
        
        tournaments = []
        for p in prefixes:
            # p is like "tournaments/id/"
            t_id = p.split('/')[-2]
            tournaments.append(t_id)
            
        if not tournaments and load_tournament_from_gcs(DEFAULT_TOURNAMENT_ID):
            tournaments = [DEFAULT_TOURNAMENT_ID]
            
        return jsonify({"tournaments": tournaments}), 200
    except Exception as e:
        logger.error(f"Error listing tournaments: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/init', methods=['POST'])
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
            "tournament_id": tournament_id
        }
        
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
def manage_judge(tournament_id):
    """Add or remove a judge."""
    try:
        data, teams = patched_load_tournament_with_id(tournament_id)
        if not data:
             return jsonify({"error": "No tournament found"}), 404
             
        if 'judges' not in data:
            data['judges'] = []

        if request.method == 'POST':
            req_data = request.json
            name = req_data.get('name')
            institution = req_data.get('institution', 'Tournament Hire')
            
            if not name:
                return jsonify({"error": "Missing judge name"}), 400
                
            judge_id = data.get('next_judge_id', 1)
            new_judge = {
                "id": judge_id,
                "name": name,
                "institution": institution,
                "matches_judged": []
            }
            data['judges'].append(new_judge)
            data['next_judge_id'] = judge_id + 1
            
            if patched_save_tournament_with_id(data, teams, tournament_id):
                return jsonify({"message": "Judge added", "judge": new_judge}), 200
            else:
                return jsonify({"error": "Failed to save judge"}), 500
                
        elif request.method == 'DELETE':
            judge_id = request.json.get('judge_id')
            if judge_id is None:
                return jsonify({"error": "Missing judge_id"}), 400
                
            data['judges'] = [j for j in data['judges'] if j.get('id') != judge_id]
            
            if patched_save_tournament_with_id(data, teams, tournament_id):
                return jsonify({"message": f"Judge {judge_id} removed"}), 200
            else:
                return jsonify({"error": "Failed to save judge removal"}), 500

    except Exception as e:
        logger.error(f"Error managing judge: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/t/<tournament_id>/assign_judge', methods=['POST'])
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
        
        # Find match
        match = next((m for m in data['matches'] if m['match_id'] == match_id), None)
        if not match:
            return jsonify({"error": f"Match {match_id} not found"}), 404
            
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
def reset_tournament(tournament_id):
    """Clear tournament data from GCS for a specific tournament."""
    logger.info(f"Tournament reset requested for {tournament_id} via /api/t/id/reset")
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob_path = get_blob_path(tournament_id)
        blob = bucket.blob(blob_path)
        
        if blob.exists():
            blob.delete()
            logger.info(f"Tournament {tournament_id} data SUCCESSFULLY deleted from GCS")
            return jsonify({"message": f"Tournament {tournament_id} data cleared"}), 200
        else:
            logger.warning(f"Tournament data blob NOT FOUND for {tournament_id} during reset request")
            return jsonify({"message": "No tournament data found to clear"}), 200
            
    except Exception as e:
        logger.error(f"Error in reset for {tournament_id}: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
