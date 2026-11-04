#!/usr/bin/env python3
"""Build the reviewed articulated Pudding rig overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.3.0.3'
BASE='9c61d249a98290e1d39e993552767cce747bfe48'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
