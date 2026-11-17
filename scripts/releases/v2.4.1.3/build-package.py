#!/usr/bin/env python3
"""Build the registered v2.4.1.3 header, today, search, subscription, push, budget and alert release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.3'
BASE='2d1977503a74d921e7c4f6005e181c46da14ca6f'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
