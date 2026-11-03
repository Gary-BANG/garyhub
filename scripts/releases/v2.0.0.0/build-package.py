#!/usr/bin/env python3
"""Build the reviewed Milu companion overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.0.0.0'
BASE='aec0312513de5b86cbcd17e10cc35af568c7dbcb'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
