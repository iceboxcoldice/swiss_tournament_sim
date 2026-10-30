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

    def test_super_admin_status(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # Non-super admin
            mock_verify.return_value = {'email': 'regular_user@example.com'}
            res = self.app.get(
                '/api/user/super_admin_status',
                headers={'Authorization': 'Bearer user-token'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertFalse(res.get_json()['is_super_admin'])

            # Super admin (coldice@gmail.com default)
            mock_verify.return_value = {'email': 'coldice@gmail.com'}
            res = self.app.get(
                '/api/user/super_admin_status',
                headers={'Authorization': 'Bearer super-token'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.get_json()['is_super_admin'])

    def test_tournament_creation_approval_workflow(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # 1. Regular user creates a tournament -> status should be 'pending'
            mock_verify.return_value = {'email': 'organizer@school.edu'}
            res = self.app.post(
                '/api/t/spring-invite/init',
                headers={'Authorization': 'Bearer user-token'},
                json={
                    'num_teams': 4,
                    'rounds': 2,
                    'elim_rounds': 0,
                    'teams': [{'name': f'Team {i}', 'institution': 'Test'} for i in range(4)]
                }
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()['status'], 'pending')
            self.assertIn('pending super admin approval', res.get_json()['message'])

            # Verify tournament listing shows status 'pending'
            res = self.app.get('/api/tournaments')
            self.assertEqual(res.status_code, 200)
            tournaments = res.get_json()['tournaments']
            pending_tourn = next((t for t in tournaments if t['id'] == 'spring-invite'), None)
            self.assertIsNotNone(pending_tourn)
            self.assertEqual(pending_tourn['status'], 'pending')
            self.assertEqual(pending_tourn['requested_by'], 'organizer@school.edu')

            # 2. Regular user tries to pair rounds while pending -> 403 Forbidden
            res = self.app.post(
                '/api/t/spring-invite/pair',
                headers={'Authorization': 'Bearer user-token'},
                json={'round': 1}
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn('pending approval', res.get_json()['error'])

            # 3. Regular user tries to approve -> 403 Forbidden
            res = self.app.post(
                '/api/t/spring-invite/approve',
                headers={'Authorization': 'Bearer user-token'}
            )
            self.assertEqual(res.status_code, 403)

            # 4. Super Admin approves tournament -> 200 Success
            mock_verify.return_value = {'email': 'coldice@gmail.com'}
            res = self.app.post(
                '/api/t/spring-invite/approve',
                headers={'Authorization': 'Bearer super-token'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()['status'], 'approved')

            # Verify tournament is now approved
            t_data, _ = main.patched_load_tournament_with_id('spring-invite')
            self.assertEqual(t_data['status'], 'approved')
            self.assertEqual(t_data['approved_by'], 'coldice@gmail.com')

            # 5. Super Admin creates a tournament -> should be auto-approved immediately
            res = self.app.post(
                '/api/t/super-cup/init',
                headers={'Authorization': 'Bearer super-token'},
                json={
                    'num_teams': 2,
                    'rounds': 1,
                    'elim_rounds': 0
                }
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()['status'], 'approved')

            # 6. Super Admin rejects a pending tournament request
            mock_verify.return_value = {'email': 'someone@school.edu'}
            self.app.post(
                '/api/t/bad-request/init',
                headers={'Authorization': 'Bearer someone-token'},
                json={'num_teams': 2, 'rounds': 1}
            )
            mock_verify.return_value = {'email': 'coldice@gmail.com'}
            res = self.app.post(
                '/api/t/bad-request/reject',
                headers={'Authorization': 'Bearer super-token'}
            )
            self.assertEqual(res.status_code, 200)
            data, _ = main.patched_load_tournament_with_id('bad-request')
            self.assertFalse(data)

    def test_coach_request_and_approval_workflow(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # 1. User prospect@school.edu submits coach request for Dartmouth
            mock_verify.return_value = {'email': 'prospect@school.edu', 'name': 'Prospect Coach'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/coach_requests',
                headers={'Authorization': 'Bearer prospect-token'},
                json={'institution': 'Dartmouth'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertIn('submitted successfully', res.get_json()['message'])
            self.assertEqual(res.get_json()['request']['institution'], 'Dartmouth')

            # 2. Admin lists coach requests
            mock_verify.return_value = {'email': 'admin@example.com'}
            res = self.app.get(
                f'/api/t/{self.tournament_id}/coach_requests',
                headers={'Authorization': 'Bearer admin-token'}
            )
            self.assertEqual(res.status_code, 200)
            reqs = res.get_json()['coach_requests']
            self.assertIn('prospect@school.edu', reqs)
            self.assertEqual(reqs['prospect@school.edu']['institution'], 'Dartmouth')

            # 3. Non-admin attempts to approve -> 403 Forbidden
            mock_verify.return_value = {'email': 'unauth@example.com'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/coach_requests/prospect@school.edu/approve',
                headers={'Authorization': 'Bearer unauth-token'}
            )
            self.assertEqual(res.status_code, 403)

            # 4. Admin approves coach request
            mock_verify.return_value = {'email': 'admin@example.com'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/coach_requests/prospect@school.edu/approve',
                headers={'Authorization': 'Bearer admin-token'}
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data['coaches']['prospect@school.edu'], 'Dartmouth')
            self.assertNotIn('prospect@school.edu', data['coach_requests'])

            # 5. Now approved coach can register a team for Dartmouth
            mock_verify.return_value = {'email': 'prospect@school.edu'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/register_team',
                headers={'Authorization': 'Bearer prospect-token'},
                json={
                    'name': 'Dartmouth Alpha',
                    'institution': 'Dartmouth',
                    'member1_name': 'Dan',
                    'member2_name': 'Dave'
                }
            )
            self.assertEqual(res.status_code, 200)

            # 6. User submits bad request, admin rejects
            mock_verify.return_value = {'email': 'bad_applicant@spam.com', 'name': 'Spam'}
            self.app.post(
                f'/api/t/{self.tournament_id}/coach_requests',
                headers={'Authorization': 'Bearer spam-token'},
                json={'institution': 'FakeSchool'}
            )
            mock_verify.return_value = {'email': 'admin@example.com'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/coach_requests/bad_applicant@spam.com/reject',
                headers={'Authorization': 'Bearer admin-token'}
            )
            self.assertEqual(res.status_code, 200)
            t_data, _ = main.patched_load_tournament_with_id(self.tournament_id)
            self.assertNotIn('bad_applicant@spam.com', t_data['auth'].get('coaches', {}))
            self.assertNotIn('bad_applicant@spam.com', t_data['auth'].get('coach_requests', {}))

    def test_student_team_self_registration_under_approved_coach(self):
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.verify_google_token') as mock_verify:
            
            # 1. Setup approved coach for Harvard
            mock_verify.return_value = {'email': 'admin@example.com'}
            self.app.post(
                f'/api/t/{self.tournament_id}/coaches',
                headers={'Authorization': 'Bearer admin-token'},
                json={'email': 'coach_harvard@harvard.edu', 'institution': 'Harvard'}
            )

            # 2. Student attempts to register team for Yale (which has no approved coach) -> 400 Bad Request
            mock_verify.return_value = {'email': 'student_yale@yale.edu'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/team_requests',
                headers={'Authorization': 'Bearer student-token'},
                json={
                    'name': 'Yale X',
                    'institution': 'Yale',
                    'members': [{'name': 'Y1', 'email': 'y1@yale.edu'}, {'name': 'Y2', 'email': 'y2@yale.edu'}]
                }
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn('does not have an approved coach', res.get_json()['error'])

            # 3. Student registers team under Harvard (which HAS an approved coach) -> 200 Success
            mock_verify.return_value = {'email': 'student_harvard@harvard.edu'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/team_requests',
                headers={'Authorization': 'Bearer student-token'},
                json={
                    'name': 'Harvard Novice 1',
                    'institution': 'Harvard',
                    'members': [
                        {'name': 'Alice Smith', 'email': 'alice@harvard.edu'},
                        {'name': 'Bob Jones', 'email': 'bob@harvard.edu'}
                    ]
                }
            )
            self.assertEqual(res.status_code, 200)
            req_data = res.get_json()
            req_id = req_data['request_id']
            self.assertIn('submitted to your Harvard coach', req_data['message'])

            # 4. Harvard coach views pending team requests -> sees Harvard Novice 1
            mock_verify.return_value = {'email': 'coach_harvard@harvard.edu'}
            res = self.app.get(
                f'/api/t/{self.tournament_id}/team_requests',
                headers={'Authorization': 'Bearer coach-token'}
            )
            self.assertEqual(res.status_code, 200)
            team_reqs = res.get_json()['team_requests']
            self.assertIn(req_id, team_reqs)
            self.assertEqual(team_reqs[req_id]['name'], 'Harvard Novice 1')

            # 5. Another coach from a different school tries to approve Harvard team -> 403 Forbidden
            mock_verify.return_value = {'email': 'admin@example.com'}
            self.app.post(
                f'/api/t/{self.tournament_id}/coaches',
                headers={'Authorization': 'Bearer admin-token'},
                json={'email': 'coach_princeton@princeton.edu', 'institution': 'Princeton'}
            )
            mock_verify.return_value = {'email': 'coach_princeton@princeton.edu'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/team_requests/{req_id}/approve',
                headers={'Authorization': 'Bearer princeton-token'}
            )
            self.assertEqual(res.status_code, 403)

            # 6. Harvard coach approves team -> 200 Success
            mock_verify.return_value = {'email': 'coach_harvard@harvard.edu'}
            res = self.app.post(
                f'/api/t/{self.tournament_id}/team_requests/{req_id}/approve',
                headers={'Authorization': 'Bearer coach-token'}
            )
            self.assertEqual(res.status_code, 200)
            self.assertIn('approved and registered successfully', res.get_json()['message'])

            # Verify team is officially registered in tournament roster
            t_data, teams_objs = main.patched_load_tournament_with_id(self.tournament_id)
            registered_team = next((t for t in teams_objs if t.name == 'Harvard Novice 1'), None)
            self.assertIsNotNone(registered_team)
            self.assertEqual(registered_team.institution, 'Harvard')
            self.assertEqual(len(registered_team.members), 2)
            self.assertEqual(t_data['config']['num_teams'], 3) # started with 2, now 3
            self.assertNotIn(req_id, t_data.get('team_requests', {}))

if __name__ == '__main__':
    unittest.main()
