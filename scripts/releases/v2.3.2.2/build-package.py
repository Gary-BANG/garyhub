#!/usr/bin/env python3
import argparse,sys
from pathlib import Path
VERSION='2.3.2.2'
BASE='ef0bebecf9b34fea5826e7694bfc230f0910bce2'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
