#!/usr/bin/env python3
"""Build the registered v2.4.1.4 settings centre release."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.4'
BASE='5306dd9b56d753b4b7fd99a92400196b392fe6f8'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
