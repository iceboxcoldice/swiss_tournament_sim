"""Swiss Tournament Simulation & Probability Package."""
import os
import sys

sim_dir = os.path.dirname(os.path.abspath(__file__))
if sim_dir not in sys.path:
    sys.path.insert(0, sim_dir)
