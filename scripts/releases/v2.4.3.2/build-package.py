#!/usr/bin/env python3
"""Build the registered v2.4.3.2 board games (Treasure Dash, Tycoon) release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.3.2'
BASE='81ec1923e3d1ce8cecd2b3d8cbd935ba10d4e198'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
