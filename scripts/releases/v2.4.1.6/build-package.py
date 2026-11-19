#!/usr/bin/env python3
"""Build the registered v2.4.1.6 homepage, tools desk and notification centre release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.6'
BASE='d0e49a9643a32fa3c64a9774680e457c3b29c8e9'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
