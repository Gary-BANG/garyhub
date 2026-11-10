#!/usr/bin/env python3
"""Build the registered study Q&A sliding-consent update."""
import argparse,sys
from pathlib import Path
VERSION='2.4.0.4'
BASE='0a5e86e20330166e546dbfede1d99dcb73ec7a2f'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
