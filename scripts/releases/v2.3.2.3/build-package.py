#!/usr/bin/env python3
import argparse,sys
from pathlib import Path
VERSION='2.3.2.3'
BASE='558559e93dbc39c05c5f89c5c07ef0bf3dea295b'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
