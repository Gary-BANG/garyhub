#!/usr/bin/env python3
"""Build the registered companion composer, outside-click and study Q&A wait update."""
import argparse,sys
from pathlib import Path
VERSION='2.4.0.3'
BASE='aa0bd193428551d57e69ad9767ba914368a1576b'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
