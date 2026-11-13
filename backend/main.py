import logging
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
SIMULATION_DIR = os.path.join(PROJECT_ROOT, 'simulation')

for p in (BACKEND_DIR, SIMULATION_DIR, PROJECT_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

import auth
import config
import routes
import storage

# Re-export configuration & helpers for backwards compatibility with existing tests
BUCKET_NAME = config.BUCKET_NAME
GOOGLE_OAUTH_CLIENT_ID = config.GOOGLE_OAUTH_CLIENT_ID
DEFAULT_TOURNAMENT_ID = config.DEFAULT_TOURNAMENT_ID
LOCAL_STORAGE_DIR = config.LOCAL_STORAGE_DIR
SUPER_ADMIN_EMAILS = config.SUPER_ADMIN_EMAILS
TESTING_MODE = config.TESTING_MODE
REQUIRE_USER_APPROVAL = config.REQUIRE_USER_APPROVAL

verify_google_token = auth.verify_google_token
require_auth = auth.require_auth
is_super_admin = auth.is_super_admin
is_user_approved = auth.is_user_approved
get_or_create_user_registration = auth.get_or_create_user_registration
get_current_actor = auth.get_current_actor

get_storage_client = storage.get_storage_client
get_blob_path = storage.get_blob_path
load_tournament_from_gcs = storage.load_tournament_from_gcs
save_tournament_to_gcs = storage.save_tournament_to_gcs
patched_load_tournament_with_id = storage.patched_load_tournament_with_id
patched_save_tournament_with_id = storage.patched_save_tournament_with_id
load_user_registry = storage.load_user_registry
save_user_registry = storage.save_user_registry
load_aliases = storage.load_aliases
save_aliases = storage.save_aliases
resolve_email = storage.resolve_email
load_raw_profile = storage.load_raw_profile
load_judge_profile = storage.load_judge_profile
save_judge_profile = storage.save_judge_profile
append_to_judge_history = storage.append_to_judge_history
log_event = storage.log_event
load_events_from_storage = storage.load_events_from_storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

STATIC_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'manager')


def create_app():
    flask_app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
    CORS(flask_app)
    storage.init_local_storage()
    routes.register_blueprints(flask_app)

    @flask_app.route('/', methods=['GET'])
    def serve_frontend():
        """Serve the frontend index.html."""
        return send_from_directory(flask_app.static_folder, 'index.html')

    @flask_app.route('/<path:path>', methods=['GET'])
    def serve_static(path):
        """Serve static files from the frontend directory."""
        if os.path.exists(os.path.join(flask_app.static_folder, path)):
            return send_from_directory(flask_app.static_folder, path)
        return send_from_directory(flask_app.static_folder, 'index.html')

    @flask_app.route('/api/health', methods=['GET'])
    def health_check():
        logger.info("Health check requested")
        return jsonify({"status": "ok"}), 200

    return flask_app


app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    app.run(host='0.0.0.0', port=port, debug=True)
