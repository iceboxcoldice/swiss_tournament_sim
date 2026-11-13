import json
import logging
import os
from dataclasses import asdict

from flask import has_request_context, request
from google.cloud import storage

import config
import event_replay
import tournament_manager as tm

logger = logging.getLogger(__name__)


def get_storage_client():
    return storage.Client()


def _bucket_name():
    return config.get_setting('BUCKET_NAME')


def _local_storage_dir():
    return config.get_setting('LOCAL_STORAGE_DIR')


def _default_tournament_id():
    return config.get_setting('DEFAULT_TOURNAMENT_ID')


def _ensure_local_dir(path):
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


def _read_text(path):
    bucket_name = _bucket_name()
    if bucket_name:
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path)
        if not blob.exists():
            return None
        return blob.download_as_text()
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def _read_json(path):
    text = _read_text(path)
    if text is None:
        return None
    return json.loads(text)


def _write_json(path, data, indent=2, sort_keys=False):
    data_str = json.dumps(data, indent=indent, sort_keys=sort_keys)
    bucket_name = _bucket_name()
    if bucket_name:
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path)
        blob.upload_from_string(data_str, content_type='application/json')
        return True
    parent = os.path.dirname(path)
    if parent:
        _ensure_local_dir(parent)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(data_str)
    return True


def _get_actor_fallback():
    if not has_request_context():
        return 'system'
    user_info = getattr(request, 'user_info', None)
    if user_info and user_info.get('email'):
        return user_info.get('email').lower().strip()
    actor_header = request.headers.get('X-User-Email')
    if actor_header:
        return actor_header.lower().strip()
    return 'system'


def init_local_storage():
    if not _bucket_name():
        logger.info("GCS_BUCKET_NAME not set. Using local filesystem storage.")
        _ensure_local_dir(_local_storage_dir())


def get_user_registry_path():
    if _bucket_name():
        return 'users/registry.json'
    user_dir = os.path.join(_local_storage_dir(), 'users')
    _ensure_local_dir(user_dir)
    return os.path.join(user_dir, 'registry.json')


def load_user_registry():
    """Load the user registry containing registration and approval statuses."""
    try:
        data = _read_json(get_user_registry_path())
        return data if data is not None else {}
    except Exception as e:
        logger.error(f"Error loading user registry: {e}")
        return {}


def save_user_registry(registry):
    """Save the user registry."""
    try:
        return _write_json(get_user_registry_path(), registry, indent=2, sort_keys=True)
    except Exception as e:
        logger.error(f"Error saving user registry: {e}")
        return False


def log_event(action, payload, tournament_id=None, actor=None):
    """Log an immutable event to the journal (local and/or GCS)."""
    try:
        actor_email = actor or _get_actor_fallback()
        storage_dir = _local_storage_dir()
        gcs_bucket = None
        bucket_name = _bucket_name()
        if bucket_name:
            try:
                gcs_bucket = get_storage_client().bucket(bucket_name)
            except Exception as e:
                logger.error(f"Error accessing GCS bucket for event log: {e}")
        return event_replay.record_event(
            storage_dir=storage_dir,
            action=action,
            payload=payload,
            actor=actor_email,
            tournament_id=tournament_id,
            gcs_bucket=gcs_bucket,
        )
    except Exception as e:
        logger.error(f"Failed to record event {action}: {e}")
        return None


def load_events_from_storage(tournament_id=None):
    """Load sequential event stream from GCS or local storage."""
    bucket_name = _bucket_name()
    if bucket_name:
        try:
            client = get_storage_client()
            bucket = client.bucket(bucket_name)
            path = (
                f"tournaments/{tournament_id}/{event_replay.EVENTS_LOG_FILE}"
                if tournament_id
                else f"events/{event_replay.EVENTS_LOG_FILE}"
            )
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
    log_path = event_replay.get_event_log_path(_local_storage_dir(), tournament_id)
    return event_replay.load_events(log_path)


def get_blob_path(tournament_id):
    """Get the storage path for a specific tournament."""
    if not tournament_id:
        tournament_id = _default_tournament_id()
    if _bucket_name():
        return f"tournaments/{tournament_id}/tournament.json"
    t_dir = os.path.join(_local_storage_dir(), tournament_id)
    _ensure_local_dir(t_dir)
    return os.path.join(t_dir, 'tournament.json')


def load_tournament_from_gcs(tournament_id=None):
    """Load tournament data from storage (GCS or Local)."""
    if tournament_id is None:
        tournament_id = _default_tournament_id()
    try:
        return _read_json(get_blob_path(tournament_id))
    except Exception as e:
        logger.error(f"Error loading {tournament_id}: {e}")
        return None


def save_tournament_to_gcs(data, tournament_id=None):
    """Save tournament data to storage (GCS or Local)."""
    if tournament_id is None:
        tournament_id = _default_tournament_id()
    try:
        return _write_json(get_blob_path(tournament_id), data, indent=2)
    except Exception as e:
        logger.error(f"Error saving {tournament_id}: {e}")
        return False


def patched_load_tournament_with_id(tournament_id):
    data = load_tournament_from_gcs(tournament_id)
    if not data:
        return {}, []
    return tm._reconstruct_teams(data)


def patched_save_tournament_with_id(data, teams, tournament_id):
    data['teams'] = [asdict(t) for t in teams]
    return save_tournament_to_gcs(data, tournament_id)


def get_aliases_path():
    if _bucket_name():
        return "profiles/aliases.json"
    p_dir = os.path.join(_local_storage_dir(), 'profiles')
    _ensure_local_dir(p_dir)
    return os.path.join(p_dir, "aliases.json")


def load_aliases():
    try:
        data = _read_json(get_aliases_path())
        return data if data is not None else {}
    except Exception as e:
        logger.error(f"Error loading aliases: {e}")
        return {}


def save_aliases(aliases_dict):
    try:
        return _write_json(get_aliases_path(), aliases_dict, indent=2)
    except Exception as e:
        logger.error(f"Error saving aliases: {e}")
        return False


def resolve_email(email):
    """Resolve secondary email to primary email using aliases.json if it exists."""
    email = email.lower().strip()
    aliases = load_aliases()
    return aliases.get(email, email)


def _safe_email(email):
    return email.lower().strip().replace('@', '_at_').replace('.', '_')


def get_profile_path(email):
    """Get storage path for a user's profile."""
    resolved_email = resolve_email(email)
    safe_email = _safe_email(resolved_email)
    if _bucket_name():
        return f"profiles/{safe_email}.json"
    p_dir = os.path.join(_local_storage_dir(), 'profiles')
    _ensure_local_dir(p_dir)
    return os.path.join(p_dir, f"{safe_email}.json")


def get_raw_profile_path(email):
    """Get storage path for an email directly without resolving aliases."""
    safe_email = _safe_email(email)
    if _bucket_name():
        return f"profiles/{safe_email}.json"
    p_dir = os.path.join(_local_storage_dir(), 'profiles')
    _ensure_local_dir(p_dir)
    return os.path.join(p_dir, f"{safe_email}.json")


def load_raw_profile(email):
    """Load profile directly for an email without resolving aliases."""
    try:
        return _read_json(get_raw_profile_path(email))
    except Exception as e:
        logger.error(f"Error loading raw profile for {email}: {e}")
        return None


def load_judge_profile(email):
    """Load a judge's global profile (paradigm and history)."""
    default_data = {"paradigm": "", "history": []}
    try:
        path = get_profile_path(email)
        text = _read_text(path)
        if text is None:
            safe = _safe_email(email)
            legacy_path = (
                f"paradigms/{safe}.json"
                if _bucket_name()
                else os.path.join(_local_storage_dir(), 'paradigms', f"{safe}.json")
            )
            legacy_text = _read_text(legacy_path)
            if legacy_text is not None:
                default_data["paradigm"] = legacy_text
            return default_data
        loaded = json.loads(text)
        if isinstance(loaded, dict):
            return loaded
        return default_data
    except Exception as e:
        logger.error(f"Error loading profile for {email}: {e}")
        return default_data


def save_judge_profile(email, profile):
    """Save a judge's global profile."""
    try:
        return _write_json(get_profile_path(email), profile, indent=2)
    except Exception as e:
        logger.error(f"Error saving profile for {email}: {e}")
        return False


def append_to_judge_history(email, record):
    """Append a match record to the judge's lifetime history."""
    profile = load_judge_profile(email)
    for existing in profile.get('history', []):
        if (
            existing.get('tournament_id') == record.get('tournament_id')
            and existing.get('match_id') == record.get('match_id')
        ):
            existing.update(record)
            return save_judge_profile(email, profile)
    if 'history' not in profile:
        profile['history'] = []
    profile['history'].append(record)
    return save_judge_profile(email, profile)
