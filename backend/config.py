import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID')
DEFAULT_TOURNAMENT_ID = 'default'
LOCAL_STORAGE_DIR = os.environ.get('LOCAL_STORAGE_DIR', os.path.join(PROJECT_ROOT, 'local_storage'))

SUPER_ADMIN_EMAILS = [
    e.strip().lower()
    for e in os.environ.get('SUPER_ADMIN_EMAILS', 'coldice@gmail.com').split(',')
    if e.strip()
]

TESTING_MODE = os.environ.get('TESTING_MODE', 'false').lower() in ('true', '1', 'yes')
REQUIRE_USER_APPROVAL = os.environ.get('REQUIRE_USER_APPROVAL', 'false').lower() in ('true', '1', 'yes')


def get_setting(name):
    """Return a configuration value, honoring runtime/test overrides on main."""
    for mod_name in ('main', 'backend.main'):
        mod = sys.modules.get(mod_name)
        if mod is not None and hasattr(mod, name):
            return getattr(mod, name)
    return globals()[name]
