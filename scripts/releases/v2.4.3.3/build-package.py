#!/usr/bin/env python3
"""Build the registered v2.4.3.3 Tycoon (trading, auctions, ways to win) release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.3.3'
BASE='731e8bcac1935c2f45e496d085fa8cc571d35304'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
