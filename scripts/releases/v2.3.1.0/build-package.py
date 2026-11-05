#!/usr/bin/env python3
"""Build the reviewed v2.3.0.4 to v2.3.1.0 overlay with the shared updater."""
import argparse,sys
from pathlib import Path
VERSION='2.3.1.0'
BASE='c87e7efcf690fff40a6e4a53b63eac8f5bb6d837'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
