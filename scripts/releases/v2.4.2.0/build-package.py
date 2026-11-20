#!/usr/bin/env python3
"""Build the registered v2.4.2.0 games site (Daydreamer) release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.2.0'
BASE='ca696d2ae307e5351821687155309c528963a560'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
