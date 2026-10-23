#!/usr/bin/env python3
"""Registered v1.3.6.1 builder; deployment behavior is configured explicitly."""
import argparse
import sys
from pathlib import Path
VERSION='1.3.6.1'
BASE='697daf65c269a8f2169857b0eb21e8cf84cf6a3e'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output')
    build(ROOT,HERE,parser.parse_args().output)
