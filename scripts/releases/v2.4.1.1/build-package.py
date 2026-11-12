#!/usr/bin/env python3
"""Build the registered Study Q&A formula rendering fix."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.1'
BASE='289662f545488cea0f52bf9c38a4948985978b88'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
