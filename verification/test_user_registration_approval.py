import os
import sys
import json
import shutil
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)

import main

class TestUserRegistrationApproval(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = os.path.join(PROJECT_ROOT, 'local_storage_user_reg_test_tmp')
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

    def test_super_admin_always_approved(self):
        """Super admin can create tournaments without explicit pre-approval."""
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.REQUIRE_USER_APPROVAL', True), \
             patch('main.TESTING_MODE', True), \
             patch('main.verify_google_token', return_value={'email': 'coldice@gmail.com', 'name': 'Super Admin'}):
            
            res = self.app.post('/api/t/sa-tournament/init',
                                json={'num_teams': 2, 'rounds': 2, 'elim_rounds': 0},
                                headers={'Authorization': 'Bearer valid-sa-token'})
            self.assertEqual(res.status_code, 200, f"Super admin should be allowed: {res.data}")
            data = res.get_json()
            self.assertEqual(data.get('status'), 'approved')

    def test_unapproved_user_blocked_and_enqueued_as_pending(self):
        """Outside user cannot create tournament until approved by Super Admin."""
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.REQUIRE_USER_APPROVAL', True), \
             patch('main.TESTING_MODE', True), \
             patch('main.verify_google_token', return_value={'email': 'new_organizer@school.edu', 'name': 'Jane Doe'}):

            # 1. Attempt to create tournament -> Blocked with 403
            res = self.app.post('/api/t/pending-tourn/init',
                                json={'num_teams': 2, 'rounds': 2, 'elim_rounds': 0},
                                headers={'Authorization': 'Bearer token-jane'})
            self.assertEqual(res.status_code, 403)
            err = res.get_json()
            self.assertIn("registration requires explicit Super Admin approval", err.get('error', ''))

            # 2. Check user status endpoint
            res_status = self.app.get('/api/user/status', headers={'Authorization': 'Bearer token-jane'})
            self.assertEqual(res_status.status_code, 200)
            status_data = res_status.get_json()
            self.assertEqual(status_data.get('status'), 'pending')
            self.assertFalse(status_data.get('is_approved'))

    def test_super_admin_approve_and_reject_flow(self):
        """Super Admin reviews user registry, approves user, user can then create tournament."""
        with patch('main.GOOGLE_OAUTH_CLIENT_ID', 'test-client-id'), \
             patch('main.REQUIRE_USER_APPROVAL', True), \
             patch('main.TESTING_MODE', True):

            # Step 1: User Jane requests registration
            with patch('main.verify_google_token', return_value={'email': 'jane@debate.org', 'name': 'Jane'}):
                reg_res = self.app.post('/api/user/register',
                                        json={'name': 'Jane Organizer', 'institution': 'Debate League'},
                                        headers={'Authorization': 'Bearer token-jane'})
                self.assertEqual(reg_res.status_code, 200)
                self.assertEqual(reg_res.get_json()['user']['status'], 'pending')

            # Step 2: Non-admin cannot approve user
            with patch('main.verify_google_token', return_value={'email': 'rando@example.com', 'name': 'Rando'}):
                unauth_res = self.app.post('/api/admin/users/jane@debate.org/approve',
                                           headers={'Authorization': 'Bearer token-rando'})
                self.assertEqual(unauth_res.status_code, 403)

            # Step 3: Super admin views pending users
            with patch('main.verify_google_token', return_value={'email': 'coldice@gmail.com', 'name': 'Super Admin'}):
                list_res = self.app.get('/api/admin/users', headers={'Authorization': 'Bearer token-sa'})
                self.assertEqual(list_res.status_code, 200)
                users = list_res.get_json().get('users', [])
                jane_entry = next((u for u in users if u['email'] == 'jane@debate.org'), None)
                self.assertIsNotNone(jane_entry)
                self.assertEqual(jane_entry['status'], 'pending')

                # Step 4: Super admin approves Jane
                appr_res = self.app.post('/api/admin/users/jane@debate.org/approve',
                                         headers={'Authorization': 'Bearer token-sa'})
                self.assertEqual(appr_res.status_code, 200)
                self.assertEqual(appr_res.get_json()['user']['status'], 'approved')

            # Step 5: Now Jane IS approved and CAN create tournament request
            with patch('main.verify_google_token', return_value={'email': 'jane@debate.org', 'name': 'Jane'}):
                init_res = self.app.post('/api/t/jane-tourn/init',
                                         json={'num_teams': 2, 'rounds': 2, 'elim_rounds': 0},
                                         headers={'Authorization': 'Bearer token-jane'})
                self.assertEqual(init_res.status_code, 200, f"Approved user should succeed: {init_res.data}")

if __name__ == '__main__':
    unittest.main()
