#!/usr/bin/env python3
"""Register v1.4.2.0 with the reviewed shared overlay and source import builders."""
import argparse,sys
from pathlib import Path
VERSION='1.4.2.0'
BASE='18cb483b3417b51686ab37b09ac2a69499233c71'
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/updater'))
from build_overlay import build
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(ROOT,HERE,parser.parse_args().output)
