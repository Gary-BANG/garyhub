#!/usr/bin/env python3
"""Build the registered v2.4.3.0 live game rooms (Word Sync, Number Duel) release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.3.0'
BASE='4511bd72a8b4310cb4f61e1e97bb04fa73c140e0'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
