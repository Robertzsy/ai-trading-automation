"""Shared seeding entry point for development and the desktop runtime."""
from pathlib import Path
import argparse
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.dsh_home import seed_dsh_home

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("app")
    parser.add_argument("home")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    result = seed_dsh_home(args.app, args.home, force=args.force)
    print(f"Seeded {len(result['seeded'])} product directories")
