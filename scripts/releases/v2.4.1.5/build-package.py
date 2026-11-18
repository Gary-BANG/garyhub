#!/usr/bin/env python3
"""Build the registered v2.4.1.5 settings completion release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.5'
BASE='0041a4ef2752fa5473bc6775452c864b3f68f17a'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
