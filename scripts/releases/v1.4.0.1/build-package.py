#!/usr/bin/env python3
"""Mouse hover fix registered with the shared reviewed overlay builder."""
import argparse
import sys
from pathlib import Path
VERSION='1.4.0.1'
BASE='4f5611b6c1d1e6def995ef9664b0035e551a806a'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output')
    build(ROOT,HERE,parser.parse_args().output)
