#!/usr/bin/env python3
"""Build the reviewed v2.4.0.1 stock analytics update."""
import argparse
import sys
from pathlib import Path

VERSION = '2.4.0.1'
BASE = '8d9777139ea7188f1ace4d8ec503b32fd870838c'
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT/'scripts/updater'))
from build_overlay import build

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output')
    build(ROOT, HERE, parser.parse_args().output)
