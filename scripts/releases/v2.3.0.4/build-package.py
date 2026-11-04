#!/usr/bin/env python3
"""Build the reviewed v2.3.0.3 to v2.3.0.4 overlay with the shared updater."""
import argparse,sys
from pathlib import Path
VERSION='2.3.0.4'
BASE='c9096802a1e8dd3bba5f56a3bc38ed617df331f3'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
