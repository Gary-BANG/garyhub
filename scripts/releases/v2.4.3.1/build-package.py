#!/usr/bin/env python3
"""Build the registered v2.4.3.1 co-op car release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.3.1'
BASE='e61b20051c4db52b709b01cec04c736134ab0585'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
