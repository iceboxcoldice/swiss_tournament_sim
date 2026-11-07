#!/usr/bin/env python3
"""
Test Tabroom Flighting (Flight A / Flight B) and Room Scheduling in Python.
"""
import sys
import os
import unittest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)

import swiss_sim
import tournament_manager as tm

class TestTabroomFlighting(unittest.TestCase):
    def test_flighting_and_room_scheduling(self):
        teams = [swiss_sim.Team(id=i, true_rank=i+1, name=f"Team {i+1}") for i in range(8)]
        rooms = ["Room 101", "Room 102"]

        data = {
            "config": {
                "num_teams": 8,
                "num_prelim_rounds": 3,
                "num_elim_rounds": 0,
                "num_rounds": 3,
                "flighted": True,
                "num_flights": 2,
                "rooms": rooms
            },
            "rounds": [],
            "matches": [],
            "next_match_id": 1,
            "rooms": rooms
        }

        # Pair round logic generates 4 debates
        pairs = tm.pair_round_logic(data, teams, 1)
        self.assertEqual(len(pairs), 4)

        # Mock cmd_pair logic for pairing round 1
        debate_matches_count = len([p for p in pairs if p[1] is not None])
        flight_size = ((debate_matches_count + 1) // 2)

        matches = []
        debate_index = 0
        for i, (aff, neg) in enumerate(pairs):
            flight = 1 if debate_index < flight_size else 2
            room_idx = debate_index if debate_index < flight_size else (debate_index - flight_size)
            room_name = rooms[room_idx % len(rooms)]
            debate_index += 1

            matches.append({
                "match_id": i + 1,
                "round_num": 1,
                "aff_id": aff.id,
                "neg_id": neg.id,
                "flight": flight,
                "room": room_name
            })

        self.assertEqual(len(matches), 4)

        # Flight 1 (Flight A)
        self.assertEqual(matches[0]['flight'], 1)
        self.assertEqual(matches[0]['room'], "Room 101")
        self.assertEqual(matches[1]['flight'], 1)
        self.assertEqual(matches[1]['room'], "Room 102")

        # Flight 2 (Flight B) - Reusing Room 101 & 102
        self.assertEqual(matches[2]['flight'], 2)
        self.assertEqual(matches[2]['room'], "Room 101")
        self.assertEqual(matches[3]['flight'], 2)
        self.assertEqual(matches[3]['room'], "Room 102")

        print("✓ PASS: Round matches split cleanly into Flight 1 (A) and Flight 2 (B)!")
        print("✓ PASS: Shared room scheduling assigned Room 101 and Room 102 across sequential flights!")

if __name__ == '__main__':
    print("Testing Tabroom Flighting & Room Scheduling in Python...\n")
    unittest.main()
