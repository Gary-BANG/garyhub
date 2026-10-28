#!/usr/bin/env python3
"""Build the reviewed Study Hub and Markdown Viewer overlay."""
import argparse,sys
from pathlib import Path
VERSION='1.4.3.1'
BASE='903f47778d3f8bf1d6efb99b1b21c10764b1cdae'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
