#!/usr/bin/env python3
"""Build the reviewed assistant tiers, fallback, search and AI logs overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.3.0.0'
BASE='a75a1e35b1d8ff6f81ff794a4080ccccacd22aa2'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
