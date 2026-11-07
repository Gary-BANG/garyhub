#!/usr/bin/env python3
"""Build the registered A-share workspace and independent VIP update."""
import argparse,sys
from pathlib import Path
VERSION='2.4.0.2'
BASE='8df09118e3f4d7a7c8d00f4c2cc79b13849ca50c'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
