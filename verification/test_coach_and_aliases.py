import os
import sys
import json
import shutil
import unittest
from unittest.mock import patch

# Set working directory to project root
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)

import main

class TestCoachAndAliases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = os.path.join(PROJECT_ROOT, 'local_storage_test_tmp')
        cls.orig_storage = main.LOCAL_STORAGE_DIR
        main.LOCAL_STORAGE_DIR = cls.test_dir

    @classmethod
    def tearDownClass(cls):
        main.LOCAL_STORAGE_DIR = cls.orig_storage
        if os.path.exists(cls.test_dir):
            shutil.rmtree(cls.test_dir)

    def setUp(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
        os.makedirs(self.test_dir)
        self.app = main.app.test_client()
        self.tournament_id = 'test-tournament-1'

        # Seed initial tournament
        init_data = {
            'config': {
                'num_teams': 2,
                'num_prelim_rounds': 3,
                'num_elim_rounds': 0,
                'num_rounds': 3,
                'sides_constrained': True
            },
            'teams': [
                {'id': 1, 'name': 'Team Alpha', 'institution': 'Harvard', 'members': ['A1', 'A2']},
                {'id': 2, 'name': 'Team Beta', 'institution': 'Yale', 'members': ['B1', 'B2']}
            ],
            'judges': [],
            'matches': [],
            'current_round': 1,
            'is_closed': False,
            'auth': {
                'admins': ['admin@example.com'],
                'judges': {},
                'coaches': {}
            }
        }
        main.save_tournament_to_gcs(init_data, self.tournament_id)

    def test_coach_crud_endpoints(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # 1. Admin GET coaches (empty initially)
            mock_verify.return_value = {'email': 'admin@example.com'}
            res = self.app.get(
                f'/api/t/{self.tournament_id}/coaches',
                headers={'Authorization': 'Bearer admin-token'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json(), {'coaches': {}})

            # 2. Admin POST add coach
            res = self.app.post(
                f'/api/t/{self.tournament_id}/coaches',
                headers={'Authorization': 'Bearer admin-token'},
                json={'email': 'coach1@harvard.edu', 'institution': 'Harvard'}
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('assigned to Harvard', data['message'])
            self.assertEqual(data['coaches']['coach1@harvard.edu'], 'Harvard')

            # 3. Add second coach
            res = self.app.post(
                f'/api/t/{self.tournament_id}/coaches',
                headers={'Authorization': 'Bearer admin-token'},
                json={'email': 'coach2@dartmouth.edu', 'institution': 'Dartmouth'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(len(res.get_json()['coaches']), 2)

            # 4. Unauthorized non-admin attempt to delete coach -> 403 Forbidden
            mock_verify.return_value = {'email': 'unauth@example.com'}
            res = self.app.delete(
                f'/api/t/{self.tournament_id}/coaches/coach1@harvard.edu',
                headers={'Authorization': 'Bearer unauth-token'}
            )
            self.assertEqual(res.status_code, 403)

            # 5. Admin DELETE coach
            mock_verify.return_value = {'email': 'admin@example.com'}
            res = self.app.delete(
                f'/api/t/{self.tournament_id}/coaches/coach1@harvard.edu',
                headers={'Authorization': 'Bearer admin-token'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertNotIn('coach1@harvard.edu', res.get_json()['coaches'])
            self.assertIn('coach2@dartmouth.edu', res.get_json()['coaches'])

    def test_coach_team_registration_and_round_lock(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # Setup coach in tournament
            mock_verify.return_value = {'email': 'admin@example.com'}
            self.app.post(
                f'/api/t/{self.tournament_id}/coaches',
                headers={'Authorization': 'Bearer admin-token'},
                json={'email': 'coach@harvard.edu', 'institution': 'Harvard'}
            )

            # Coach registers team for their own institution Harvard -> 200 Success
            mock_verify.return_value = {'email': 'coach@harvard.edu'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/register_team',
                headers={'Authorization': 'Bearer coach-token'},
                json={
                    'name': 'Harvard Gamma',
                    'institution': 'Harvard',
                    'member1_name': 'Alice',
                    'member1_email': 'alice@harvard.edu',
                    'member2_name': 'Bob',
                    'member2_email': 'bob@harvard.edu'
                }
            )
            self.assertEqual(res.status_code, 200)
            t_data, _ = main.patched_load_tournament_with_id(self.tournament_id)
            self.assertEqual(t_data['config']['num_teams'], 3)
            self.assertEqual(len(t_data['teams']), 3)

            # Coach tries to register team for another institution -> 403 Forbidden
            res = self.app.post(
                f'/api/t/{self.tournament_id}/register_team',
                headers={'Authorization': 'Bearer coach-token'},
                json={
                    'name': 'Yale Gamma',
                    'institution': 'Yale',
                    'member1_name': 'Charlie',
                    'member2_name': 'David'
                }
            )
            self.assertEqual(res.status_code, 403)

            # Now simulate round 1 being paired
            t_data['matches'] = [{
                'match_id': 1,
                'round_num': 1,
                'aff_team_id': 1,
                'neg_team_id': 2,
                'outcome': None,
                'judge_id': None
            }]
            main.save_tournament_to_gcs(t_data, self.tournament_id)

            # Attempt to register team after round paired -> 400 Bad Request
            res = self.app.post(
                f'/api/t/{self.tournament_id}/register_team',
                headers={'Authorization': 'Bearer coach-token'},
                json={
                    'name': 'Harvard Delta',
                    'institution': 'Harvard',
                    'member1_name': 'Eve',
                    'member2_name': 'Frank'
                }
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn("preliminary rounds have been paired", res.get_json()['error'])

    def test_email_aliasing_and_profile_merge(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # Setup primary profile with empty paradigm
            primary_email = 'primary@example.com'
            main.save_judge_profile(primary_email, {
                'email': primary_email,
                'display_name': 'Primary User',
                'paradigm': '',
                'history': [
                    {'tournament_id': 'tourn1', 'round_num': 1, 'role': 'judge', 'timestamp': '2026-01-01'}
                ]
            })

            # Setup secondary profile with different history and paradigm
            secondary_email = 'secondary@school.edu'
            main.save_judge_profile(secondary_email, {
                'email': secondary_email,
                'display_name': 'Secondary User',
                'paradigm': 'Secondary specific paradigm.',
                'history': [
                    {'tournament_id': 'tourn2', 'round_num': 2, 'role': 'debater', 'timestamp': '2026-02-01'}
                ]
            })

            # User logs in as primary@example.com and links secondary@school.edu
            mock_verify.return_value = {'email': primary_email}
            res = self.app.post(
                '/api/user/link_email',
                headers={'Authorization': 'Bearer prim-token'},
                json={'secondary_email': secondary_email}
            )
            self.assertEqual(res.status_code, 200)
            self.assertIn('Successfully linked', res.get_json()['message'])

            # Fetch primary profile and verify merge
            primary_prof = main.load_judge_profile(primary_email)
            self.assertEqual(primary_prof['paradigm'], 'Secondary specific paradigm.')
            self.assertEqual(len(primary_prof['history']), 2)

            # Fetch via secondary email alias -> resolves to merged primary profile
            alias_prof = main.load_judge_profile(secondary_email)
            self.assertEqual(alias_prof['email'], primary_email)
            self.assertEqual(len(alias_prof['history']), 2)

            # Test route alias GET /api/profile/<email>
            res = self.app.get(f'/api/profile/{secondary_email}')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()['email'], primary_email)

if __name__ == '__main__':
    unittest.main()
