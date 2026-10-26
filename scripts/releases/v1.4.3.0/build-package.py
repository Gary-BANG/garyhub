#!/usr/bin/env python3
"""Register v1.4.3.0 with the shared checked overlay builder."""
import argparse,sys
from pathlib import Path
VERSION='1.4.3.0'
BASE='0acf0c89dba8db923441df162a22743d604a5ebf'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
