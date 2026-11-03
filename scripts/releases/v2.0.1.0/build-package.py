#!/usr/bin/env python3
"""Build the reviewed companion characters overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.0.1.0'
BASE='3a8f4f7060f2054ddd33cc994f1a7b4c63f62ddc'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
