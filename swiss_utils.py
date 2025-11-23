"""
Common utilities and argument parsing for Swiss tournament simulation scripts.
"""

import argparse

def create_base_parser(description):
    """Create a base argument parser with common arguments."""
    parser = argparse.ArgumentParser(description=description)
    return parser

def add_common_args(parser):
    """Add common arguments to a parser."""
    parser.add_argument("--donotuse-buchholz-pairing", action="store_true", 
                       help="Don't use Buchholz score for pairing (default: False)")
    parser.add_argument("--win-model", type=str, 
                       choices=['elo', 'linear', 'deterministic'], 
                       default='elo', 
                       help="Win probability model (default: elo)")
    return parser

def add_tournament_args(parser):
    """Add tournament configuration arguments."""
    parser.add_argument("teams", type=int, help="Number of teams")
    parser.add_argument("rounds", type=int, help="Number of rounds")
    return parser

def add_simulations_arg(parser, default=10000):
    """Add simulations argument."""
    parser.add_argument("simulations", type=int, nargs='?', default=default,
                       help=f"Number of simulations to run (default: {default})")
    return parser

def print_simulation_header(num_teams, num_rounds, num_simulations, use_buchholz, win_model, extra_info=""):
    """Print standard simulation header."""
    print(f"Simulating {num_simulations} tournaments with {num_teams} teams, {num_rounds} rounds...")
    if extra_info:
        print(extra_info)
    print(f"Buchholz Pairing: {'Enabled' if use_buchholz else 'Disabled'}")
    print(f"Win Model: {win_model}")
    print()

def print_progress(current, total, interval=1000):
    """Print simulation progress."""
    if (current + 1) % interval == 0:
        print(f"Completed {current + 1} simulations...", end='\r')
