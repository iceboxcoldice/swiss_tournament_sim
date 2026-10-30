import os
import sys
import json
import shutil
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)

import main
import event_replay

class TestEventReplay(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = os.path.join(PROJECT_ROOT, 'local_storage_replay_tmp')
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
        self.tournament_id = 't-replay-101'

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_full_lifecycle_event_journal_and_replay(self):
        """
        Execute full lifecycle operations via API endpoints and verify that:
        1. All mutating actions are recorded sequentially to events.jsonl
        2. Audit endpoints return correct event history
        3. ReplayEngine deterministically reconstructs exact platform state from scratch
        """
        super_admin_email = 'coldice@gmail.com'
        admin_email = 'director@tournament.org'
        coach_email = 'coach.smith@stanford.edu'
        judge_email = 'judge.dave@debate.org'
        debater_email = 'debater.alice@stanford.edu'

        # 1. Init Tournament (pending approval)
        init_payload = {
            "num_teams": 4,
            "rounds": 2,
            "elim_rounds": 0,
            "teams": [
                {"name": "Stanford AA", "institution": "Stanford", "members": [{"name": "Alice", "email": debater_email}]},
                {"name": "Berkeley BB", "institution": "Berkeley", "members": [{"name": "Bob", "email": "bob@berkeley.edu"}]},
                {"name": "Harvard CC", "institution": "Harvard", "members": [{"name": "Charlie", "email": "charlie@harvard.edu"}]},
                {"name": "Yale DD", "institution": "Yale", "members": [{"name": "Dave", "email": "dave@yale.edu"}]}
            ]
        }
        res = self.app.post(
            f'/api/t/{self.tournament_id}/init',
            data=json.dumps(init_payload),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # 2. Super Admin approves tournament
        res = self.app.post(
            f'/api/t/{self.tournament_id}/approve',
            content_type='application/json',
            headers={'X-User-Email': super_admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # 3. Coach submits verification request
        res = self.app.post(
            f'/api/t/{self.tournament_id}/coach_requests',
            data=json.dumps({'institution': 'Stanford', 'name': 'Coach Smith'}),
            content_type='application/json',
            headers={'X-User-Email': coach_email}
        )
        self.assertEqual(res.status_code, 200)

        # 4. Admin approves coach request
        res = self.app.post(
            f'/api/t/{self.tournament_id}/coach_requests/{coach_email}/approve',
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # 5. Direct coach addition by admin
        res = self.app.post(
            f'/api/t/{self.tournament_id}/coaches',
            data=json.dumps({'email': 'coach.brown@brown.edu', 'institution': 'Brown'}),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # 6. Student team self-registration request under Stanford coach
        res = self.app.post(
            f'/api/t/{self.tournament_id}/team_requests',
            data=json.dumps({
                'name': 'Stanford Nova',
                'institution': 'Stanford',
                'members': [{'name': 'Eve', 'email': 'eve@stanford.edu'}]
            }),
            content_type='application/json',
            headers={'X-User-Email': 'eve@stanford.edu'}
        )
        self.assertEqual(res.status_code, 200)
        req_id = res.get_json()['request_id']

        # 7. Coach approves student team request
        res = self.app.post(
            f'/api/t/{self.tournament_id}/team_requests/{req_id}/approve',
            content_type='application/json',
            headers={'X-User-Email': coach_email}
        )
        self.assertEqual(res.status_code, 200)

        # 8. Add Judge
        res = self.app.post(
            f'/api/t/{self.tournament_id}/judge',
            data=json.dumps({
                'name': 'Dave Judge',
                'institution': 'Tournament Hire',
                'email': judge_email
            }),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)
        judge_id = res.get_json()['judge']['id']

        # 9. Pair Round 1
        res = self.app.post(
            f'/api/t/{self.tournament_id}/pair',
            data=json.dumps({'round': 1}),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)
        matches = res.get_json()['matches']
        self.assertGreater(len(matches), 0)
        first_match_id = matches[0]['match_id']

        # 10. Assign Judge to Match
        res = self.app.post(
            f'/api/t/{self.tournament_id}/assign_judge',
            data=json.dumps({'match_id': first_match_id, 'judge_id': judge_id}),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # 11. Report Result for All Round 1 Matches
        for m in matches:
            if m.get('neg_id') != -1:
                res = self.app.post(
                    f'/api/t/{self.tournament_id}/report',
                    data=json.dumps({
                        'match_id': m['match_id'],
                        'result': 'A',
                        'judge_id': judge_id,
                        'speaker_points': {'affPoints': 29.0, 'negPoints': 28.5}
                    }),
                    content_type='application/json',
                    headers={'X-User-Email': admin_email}
                )
                self.assertEqual(res.status_code, 200)

        # 12. Update Judge Paradigm
        res = self.app.post(
            '/api/judge_profile',
            data=json.dumps({'paradigm': 'Flow judge. Tabula rasa.'}),
            content_type='application/json',
            headers={'X-User-Email': judge_email}
        )
        self.assertEqual(res.status_code, 200)

        # 13. Link secondary email alias
        secondary_email = 'dave.personal@gmail.com'
        res = self.app.post(
            '/api/user/link_email',
            data=json.dumps({'secondary_email': secondary_email}),
            content_type='application/json',
            headers={'X-User-Email': judge_email}
        )
        self.assertEqual(res.status_code, 200)

        # 14. Close tournament
        res = self.app.post(
            f'/api/t/{self.tournament_id}/close',
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # ---- VERIFY AUDIT API ENDPOINTS ----
        # A. Tournament events endpoint
        res = self.app.get(f'/api/t/{self.tournament_id}/events', headers={'X-User-Email': admin_email})
        self.assertEqual(res.status_code, 200)
        t_events = res.get_json()['events']
        self.assertGreaterEqual(len(t_events), 10)
        action_names = [e['action'] for e in t_events]
        self.assertIn('TOURNAMENT_INIT', action_names)
        self.assertIn('TOURNAMENT_APPROVED', action_names)
        self.assertIn('COACH_REQUESTED', action_names)
        self.assertIn('COACH_APPROVED', action_names)
        self.assertIn('COACH_ADDED', action_names)
        self.assertIn('TEAM_REQUESTED', action_names)
        self.assertIn('TEAM_APPROVED', action_names)
        self.assertIn('JUDGE_ADDED', action_names)
        self.assertIn('ROUND_PAIRED', action_names)
        self.assertIn('BALLOT_REPORTED', action_names)
        self.assertIn('TOURNAMENT_CLOSED', action_names)

        # B. Central events endpoint (Super Admin)
        res = self.app.get('/api/events', headers={'X-User-Email': super_admin_email})
        self.assertEqual(res.status_code, 200)
        central_events = res.get_json()['events']
        self.assertGreaterEqual(len(central_events), len(t_events))
        # Verify global actions like PARADIGM_UPDATED and EMAIL_LINKED are in central log
        central_actions = [e['action'] for e in central_events]
        self.assertIn('PARADIGM_UPDATED', central_actions)
        self.assertIn('EMAIL_LINKED', central_actions)

        # ---- VERIFY DETERMINISTIC STATE RECONSTRUCTION ----
        # Snapshot current live state
        live_t_data = main.load_tournament_from_gcs(self.tournament_id)
        self.assertIsNotNone(live_t_data)
        self.assertTrue(live_t_data.get('is_closed'))

        # Prepare a clean reconstruction target directory
        reconstructed_dir = os.path.join(PROJECT_ROOT, 'reconstruction_test_tmp')
        if os.path.exists(reconstructed_dir):
            shutil.rmtree(reconstructed_dir)
        os.makedirs(reconstructed_dir)

        try:
            # Load all events from central log
            log_path = event_replay.get_event_log_path(self.test_dir)
            events = event_replay.load_events(log_path)
            self.assertGreater(len(events), 0)

            # Replay all events into reconstructed_dir
            engine = event_replay.ReplayEngine(reconstructed_dir)
            engine.replay_all(events)

            # Verify Reconstructed Tournament State
            rep_t_path = os.path.join(reconstructed_dir, self.tournament_id, 'tournament.json')
            self.assertTrue(os.path.exists(rep_t_path), f"File {rep_t_path} was not created by replay")
            with open(rep_t_path, 'r', encoding='utf-8') as f:
                replayed_t_data = json.load(f)

            # Assert key tournament state matches live tournament
            self.assertEqual(replayed_t_data['status'], live_t_data['status'])
            self.assertEqual(replayed_t_data['is_closed'], live_t_data['is_closed'])
            self.assertEqual(replayed_t_data['current_round'], live_t_data['current_round'])
            self.assertEqual(replayed_t_data['config'], live_t_data['config'])
            self.assertEqual(len(replayed_t_data['teams']), len(live_t_data['teams']))
            self.assertEqual(len(replayed_t_data['matches']), len(live_t_data['matches']))
            self.assertEqual(len(replayed_t_data['judges']), len(live_t_data['judges']))
            self.assertEqual(replayed_t_data['auth']['coaches'], live_t_data['auth']['coaches'])

            # Assert match outcome and ballot result reconstructed
            rep_match = next(m for m in replayed_t_data['matches'] if m['match_id'] == first_match_id)
            live_match = next(m for m in live_t_data['matches'] if m['match_id'] == first_match_id)
            self.assertEqual(rep_match['result'], live_match['result'])
            self.assertEqual(rep_match['judge_id'], live_match['judge_id'])
            self.assertEqual(rep_match['speaker_points'], live_match['speaker_points'])

            # Verify Aliases reconstruction
            rep_alias_path = os.path.join(reconstructed_dir, 'profiles', 'aliases.json')
            self.assertTrue(os.path.exists(rep_alias_path))
            with open(rep_alias_path) as f:
                replayed_aliases = json.load(f)
            self.assertEqual(replayed_aliases.get(secondary_email), judge_email)

            # Verify Judge Profile & Paradigm reconstruction
            rep_judge_path = engine._profile_path(judge_email)
            self.assertTrue(os.path.exists(rep_judge_path))
            with open(rep_judge_path) as f:
                replayed_judge_profile = json.load(f)
            self.assertEqual(replayed_judge_profile.get('paradigm'), 'Flow judge. Tabula rasa.')
            self.assertIn(secondary_email, replayed_judge_profile.get('aliases', []))
            self.assertGreater(len(replayed_judge_profile.get('history', [])), 0)

            # Verify Debater Participation History reconstruction
            debater_participant_email = 'eve@stanford.edu'
            rep_debater_path = engine._profile_path(debater_participant_email)
            self.assertTrue(os.path.exists(rep_debater_path))
            with open(rep_debater_path) as f:
                replayed_debater_profile = json.load(f)
            self.assertGreater(len(replayed_debater_profile.get('history', [])), 0)
            self.assertEqual(replayed_debater_profile['history'][0]['type'], 'participation')
            self.assertEqual(replayed_debater_profile['history'][0]['tournament_id'], self.tournament_id)

            print("\n[SUCCESS] Deterministic Replay Engine fully verified all platform state!")

        finally:
            if os.path.exists(reconstructed_dir):
                shutil.rmtree(reconstructed_dir)

    def test_cli_interface(self):
        """Test event_replay.py CLI flags (--verify and --replay)."""
        import subprocess
        # 1. Initialize a mini tournament so events exist
        res = self.app.post(
            f'/api/t/cli-tournament/init',
            data=json.dumps({"num_teams": 2, "rounds": 1}),
            content_type='application/json',
            headers={'X-User-Email': 'coldice@gmail.com'}
        )
        self.assertEqual(res.status_code, 200)

        # 2. Test CLI --replay into target directory
        cli_target = os.path.join(self.test_dir, 'cli_replayed')
        central_log = event_replay.get_event_log_path(self.test_dir)
        cmd_replay = [
            sys.executable,
            os.path.join(PROJECT_ROOT, 'event_replay.py'),
            '--replay', central_log,
            '--target', cli_target,
            '--tournament', 'cli-tournament'
        ]
        result_replay = subprocess.run(cmd_replay, capture_output=True, text=True)
        self.assertEqual(result_replay.returncode, 0, f"CLI replay failed: {result_replay.stderr}")
        self.assertTrue(os.path.exists(os.path.join(cli_target, 'cli-tournament', 'tournament.json')))

        # 3. Test CLI --verify against test storage directory
        cmd_verify = [
            sys.executable,
            os.path.join(PROJECT_ROOT, 'event_replay.py'),
            '--verify',
            '--storage', self.test_dir
        ]
        result_verify = subprocess.run(cmd_verify, capture_output=True, text=True)
        self.assertEqual(result_verify.returncode, 0, f"CLI verify failed: {result_verify.stdout}\n{result_verify.stderr}")
        self.assertIn("100% Deterministic State Replay & Rule Invariants Verified!", result_verify.stdout)

        # 4. Test consistency verification API endpoints
        res_t = self.app.get('/api/t/cli-tournament/verify_consistency', headers={'X-User-Email': 'coldice@gmail.com'})
        self.assertEqual(res_t.status_code, 200)
        self.assertTrue(res_t.get_json()['is_consistent'])

        res_p = self.app.get('/api/verify_consistency', headers={'X-User-Email': 'coldice@gmail.com'})
        self.assertEqual(res_p.status_code, 200)
        self.assertTrue(res_p.get_json()['is_consistent'])

    def test_rule_validation_anomalies(self):
        """Test that validate_event_rules detects out-of-order and anomalous events."""
        # 1. Monotonic timestamp violation
        events_timestamp = [
            {"action": "TOURNAMENT_INIT", "tournament_id": "t1", "timestamp": "2026-10-30T10:00:00Z", "payload": {}},
            {"action": "COACH_REQUESTED", "tournament_id": "t1", "timestamp": "2026-10-30T09:00:00Z", "payload": {"email": "c@s.edu"}}
        ]
        violations = event_replay.validate_event_rules(events_timestamp)
        self.assertTrue(any(v['rule'] == 'MONOTONIC_TIMESTAMPS' for v in violations))

        # 2. Mutation before initialization
        events_uninit = [
            {"action": "ROUND_PAIRED", "tournament_id": "uninit_t", "timestamp": "2026-10-30T10:00:00Z", "payload": {"round_num": 1}}
        ]
        violations = event_replay.validate_event_rules(events_uninit)
        self.assertTrue(any(v['rule'] == 'UNINITIALIZED_TOURNAMENT' for v in violations))

        # 3. Mutation after close
        events_closed = [
            {"action": "TOURNAMENT_INIT", "tournament_id": "t2", "timestamp": "2026-10-30T10:00:00Z", "payload": {}},
            {"action": "TOURNAMENT_CLOSED", "tournament_id": "t2", "timestamp": "2026-10-30T11:00:00Z", "payload": {}},
            {"action": "ROUND_PAIRED", "tournament_id": "t2", "timestamp": "2026-10-30T12:00:00Z", "payload": {"round_num": 1}}
        ]
        violations = event_replay.validate_event_rules(events_closed)
        self.assertTrue(any(v['rule'] == 'MUTATION_AFTER_CLOSE' for v in violations))

        # 4. Unknown ballot match reference
        events_bad_ballot = [
            {"action": "TOURNAMENT_INIT", "tournament_id": "t3", "timestamp": "2026-10-30T10:00:00Z", "payload": {}},
            {"action": "BALLOT_REPORTED", "tournament_id": "t3", "timestamp": "2026-10-30T11:00:00Z", "payload": {"match_id": 9999, "result": "A"}}
        ]
        violations = event_replay.validate_event_rules(events_bad_ballot)
        self.assertTrue(any(v['rule'] == 'UNKNOWN_BALLOT_MATCH' for v in violations))

    def test_open_registration_and_start_tournament(self):
        """Test tournament creation with 0 teams, dynamic registration, and closing on start."""
        tid = 't-open-registration'
        admin_email = 'admin@debate.org'
        coach_email = 'coach@mit.edu'

        # 1. Initialize with 0 teams (Open Registration)
        res = self.app.post(
            f'/api/t/{tid}/init',
            data=json.dumps({"rounds": 3, "num_teams": 0}),
            content_type='application/json',
            headers={'X-User-Email': 'coldice@gmail.com'}
        )
        self.assertEqual(res.status_code, 200)
        t_data = res.get_json()
        self.assertEqual(t_data['config']['num_teams'], 0)

        # 2. Add an approved coach
        res = self.app.post(
            f'/api/t/{tid}/coaches',
            data=json.dumps({"email": coach_email, "institution": "MIT"}),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)

        # 3. Trying to start with 0 teams fails
        res = self.app.post(
            f'/api/t/{tid}/start',
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("At least 2 teams", res.get_json()['error'])

        # 4. Coach registers Team 1
        res = self.app.post(
            f'/api/t/{tid}/register_team',
            data=json.dumps({
                "name": "MIT Alpha",
                "institution": "MIT",
                "members": [{"name": "M1", "email": "m1@mit.edu"}, {"name": "M2", "email": "m2@mit.edu"}]
            }),
            content_type='application/json',
            headers={'X-User-Email': coach_email}
        )
        self.assertEqual(res.status_code, 200)

        # 5. Student submits team request for Team 2 under MIT coach
        res = self.app.post(
            f'/api/t/{tid}/team_requests',
            data=json.dumps({
                "name": "MIT Beta",
                "institution": "MIT",
                "members": [{"name": "M3", "email": "m3@mit.edu"}, {"name": "M4", "email": "m4@mit.edu"}]
            }),
            content_type='application/json',
            headers={'X-User-Email': 'm3@mit.edu'}
        )
        self.assertEqual(res.status_code, 200)
        req_id = res.get_json()['request_id']

        # 6. Coach approves Team 2
        res = self.app.post(
            f'/api/t/{tid}/team_requests/{req_id}/approve',
            content_type='application/json',
            headers={'X-User-Email': coach_email}
        )
        self.assertEqual(res.status_code, 200)

        # Verify 2 teams registered
        data = main.load_tournament_from_gcs(tid)
        self.assertEqual(len(data['teams']), 2)
        self.assertFalse(data.get('is_started'))

        # 7. Admin starts tournament (locks registration and pairs Round 1)
        res = self.app.post(
            f'/api/t/{tid}/start',
            data=json.dumps({"pair_round_1": True}),
            content_type='application/json',
            headers={'X-User-Email': admin_email}
        )
        self.assertEqual(res.status_code, 200)
        start_data = res.get_json()
        self.assertTrue(start_data['is_started'])
        self.assertEqual(len(start_data['matches']), 1) # 2 teams = 1 match

        # 8. Verify further team registrations are now REJECTED
        res_post_start = self.app.post(
            f'/api/t/{tid}/register_team',
            data=json.dumps({
                "name": "MIT Late Entry",
                "institution": "MIT",
                "members": []
            }),
            content_type='application/json',
            headers={'X-User-Email': coach_email}
        )
        self.assertEqual(res_post_start.status_code, 400)
        self.assertIn("Registration is closed", res_post_start.get_json()['error'])

        # 9. Verify student team requests are now REJECTED
        res_req_late = self.app.post(
            f'/api/t/{tid}/team_requests',
            data=json.dumps({
                "name": "MIT Too Late",
                "institution": "MIT",
                "members": []
            }),
            content_type='application/json',
            headers={'X-User-Email': 'late@mit.edu'}
        )
        self.assertEqual(res_req_late.status_code, 400)
        self.assertIn("Registration is closed", res_req_late.get_json()['error'])

        # 10. Verify consistency and replay for this tournament
        report = event_replay.verify_storage_consistency(self.test_dir, tid)
        self.assertTrue(report['is_consistent'], f"Consistency report failed: {report}")

if __name__ == '__main__':
    unittest.main()
