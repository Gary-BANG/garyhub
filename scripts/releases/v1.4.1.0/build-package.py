#!/usr/bin/env python3
"""Research Dictionary release, using the reviewed shared overlay builder."""
import argparse
import sys
from pathlib import Path
VERSION='1.4.1.0'
BASE='637d86faae37d6c06b74b15bf850e82e301c8ad7'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output')
    build(ROOT,HERE,parser.parse_args().output)
