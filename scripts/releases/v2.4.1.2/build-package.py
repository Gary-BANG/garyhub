#!/usr/bin/env python3
"""Build the registered Study Q&A code block fix."""
import argparse,sys
from pathlib import Path
VERSION='2.4.1.2'
BASE='3b7f794db69a2aa26173206ecc0260e1441736ea'
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
