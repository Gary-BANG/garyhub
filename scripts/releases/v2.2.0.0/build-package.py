#!/usr/bin/env python3
"""Build the reviewed companion assistant overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.2.0.0'
BASE='62f430a51afb019993871b2bd2f8594259670dd8'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
