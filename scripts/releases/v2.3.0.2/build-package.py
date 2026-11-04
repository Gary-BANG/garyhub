#!/usr/bin/env python3
"""Build the reviewed Lili rig and steadier companion landing overlay."""
import argparse,sys
from pathlib import Path
VERSION='2.3.0.2'
BASE='5a45333942b7d2602f4645f328d6caea535a49b2'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
