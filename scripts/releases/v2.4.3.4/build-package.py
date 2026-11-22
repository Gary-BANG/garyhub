#!/usr/bin/env python3
"""Build the registered v2.4.3.4 Tycoon (computer judgement, bankruptcy settled with the bank) release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.3.4'
BASE='2c51ae729aa8047c30e1f5624cbeb3f6ff1b6e71'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
