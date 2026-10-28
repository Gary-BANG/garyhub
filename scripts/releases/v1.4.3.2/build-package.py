#!/usr/bin/env python3
"""Build the reviewed Lab formula and tool music overlay."""
import argparse,sys
from pathlib import Path
VERSION='1.4.3.2'
BASE='2b3d597e3f000b9340356aed6191af81970368cb'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
