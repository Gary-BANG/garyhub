#!/usr/bin/env python3
"""Build the reviewed Elsewhere (sites.garyhub.uk) overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.1.0.0'
BASE='d21eecd738ff22a400957e948b8f413337525f31'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
