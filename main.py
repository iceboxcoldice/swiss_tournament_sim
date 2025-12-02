import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import storage
import tournament_manager as tm
import swiss_sim

app = Flask(__name__)
# Enable CORS for all routes, allowing requests from GitHub Pages
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# GCS Configuration
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'swiss-tournament-data')
TOURNAMENT_BLOB_NAME = 'tournament.json'

def get_storage_client():
    return storage.Client()

def load_tournament_from_gcs():
    """Load tournament data from GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(TOURNAMENT_BLOB_NAME)
        
        if not blob.exists():
            return None
            
        data_str = blob.download_as_text()
        return json.loads(data_str)
    except Exception as e:
        logger.error(f"Error loading from GCS: {e}")
        return None

def save_tournament_to_gcs(data):
    """Save tournament data to GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(TOURNAMENT_BLOB_NAME)
        
        blob.upload_from_string(json.dumps(data, indent=2), content_type='application/json')
        return True
    except Exception as e:
        logger.error(f"Error saving to GCS: {e}")
        return False

# Monkey patch tournament_manager to use GCS instead of local file
def patched_load_tournament():
    data = load_tournament_from_gcs()
    if not data:
        # Return empty/default structure if not found
        # We need to raise error or handle gracefully depending on caller
        # For init, we might want to check existence.
        # But load_tournament_data usually expects file to exist.
        print("Warning: Tournament data not found in GCS")
        return {}, []
    
    return tm._reconstruct_teams(data)

tm.load_tournament_impl = patched_load_tournament

def patched_save_tournament(data, teams):
    # Update teams data
    data['teams'] = [swiss_sim.asdict(t) for t in teams]
    return save_tournament_to_gcs(data)

tm.save_tournament_impl = patched_save_tournament


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/api/init', methods=['POST'])
def init_tournament():
    """Initialize a new tournament."""
    try:
        req_data = request.json
        num_teams = req_data.get('num_teams')
        rounds = req_data.get('rounds')
        elim_rounds = req_data.get('elim_rounds', 0)
        
        if not num_teams or not rounds:
            return jsonify({"error": "Missing num_teams or rounds"}), 400
            
        # Create initial data structure
        teams = []
        for i in range(num_teams):
            teams.append(swiss_sim.Team(id=i, true_rank=0, name=f"Team {i+1}"))
            
        data = {
            "config": {
                "num_teams": num_teams,
                "num_rounds": rounds,
                "num_elim_rounds": elim_rounds,
            },
            "current_round": 0,
            "rounds": [],
            "teams": [swiss_sim.asdict(t) for t in teams],
            "matches": [],
            "next_match_id": 1
        }
        
        if save_tournament_to_gcs(data):
            return jsonify({"message": "Tournament initialized", "config": data['config']}), 200
        else:
            return jsonify({"error": "Failed to save tournament data"}), 500
            
    except Exception as e:
        logger.error(f"Error in init: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/data', methods=['GET'])
def get_data():
    """Get full tournament data (for syncing)."""
    data = load_tournament_from_gcs()
    if data:
        return jsonify(data), 200
    else:
        return jsonify({"error": "No tournament found"}), 404

@app.route('/api/pair', methods=['POST'])
def pair_round():
    """Pair the next round."""
    try:
        req_data = request.json
        round_num = req_data.get('round')
        
        if not round_num:
             return jsonify({"error": "Missing round number"}), 400
        
        data, teams = tm.load_tournament()
        if not data:
             return jsonify({"error": "No tournament found"}), 404
             
        try:
            pairs = tm.pair_round_logic(data, teams, round_num)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
            
        # Create matches from pairs
        new_matches = []
        next_match_id = data.get('next_match_id', 1)
        
        for p in pairs:
            # Check if it's a bye
            if p[1] == -1:
                # Bye
                m = {
                    "match_id": next_match_id,
                    "round_num": round_num,
                    "aff_id": p[0],
                    "neg_id": -1,
                    "aff_name": next(t.name for t in teams if t.id == p[0]),
                    "neg_name": "BYE",
                    "result": "A", # Auto-win for bye
                    "judge_id": -1,
                    "speaker_points": None
                }
            else:
                m = {
                    "match_id": next_match_id,
                    "round_num": round_num,
                    "aff_id": p[0],
                    "neg_id": p[1],
                    "aff_name": next(t.name for t in teams if t.id == p[0]),
                    "neg_name": next(t.name for t in teams if t.id == p[1]),
                    "result": None,
                    "judge_id": -1, # No judge assigned yet
                    "speaker_points": None
                }
            new_matches.append(m)
            next_match_id += 1
            
        # Update data
        data['matches'].extend(new_matches)
        data['rounds'].append([m['match_id'] for m in new_matches])
        data['next_match_id'] = next_match_id
        data['current_round'] = round_num
        
        if tm.save_tournament(data, teams):
            return jsonify({"message": f"Paired Round {round_num}", "matches": new_matches}), 200
        else:
            return jsonify({"error": "Failed to save pairings"}), 500

@app.route('/api/report', methods=['POST'])
def report_result():
    """Report a match result."""
    try:
        req_data = request.json
        match_id = req_data.get('match_id')
        result = req_data.get('result') # 'A' or 'N'
        judge_id = req_data.get('judge_id')
        speaker_points = req_data.get('speaker_points') # Optional dict
        
        if not match_id or not result:
            return jsonify({"error": "Missing match_id or result"}), 400
            
        data, teams = tm.load_tournament()
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
        # Create map for O(1) lookup
        team_map = {t.id: t for t in teams}
        tm.recalculate_stats(data, teams, team_map)
        
        if tm.save_tournament(data, teams):
            return jsonify({"message": f"Reported result for Match {match_id}"}), 200
        else:
            return jsonify({"error": "Failed to save result"}), 500

    except Exception as e:
        logger.error(f"Error in report: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
