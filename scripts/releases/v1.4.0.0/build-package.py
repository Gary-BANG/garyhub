#!/usr/bin/env python3
"""Registered Tools Dock release, using the reviewed shared overlay builder."""
import argparse
import sys
from pathlib import Path
VERSION='1.4.0.0'
BASE='bf5d8e2aa1f87024ba3c183b5e5d4155dc6e6a4f'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output')
    build(ROOT,HERE,parser.parse_args().output)
