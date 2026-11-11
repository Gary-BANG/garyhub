#!/usr/bin/env python3
"""Build the registered starfield homepage and developer profile update."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.0'
BASE='97ad2f22761547f216b0794915debb1ac3cfc17e'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
