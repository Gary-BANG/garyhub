#!/usr/bin/env python3
"""Render GaryHub's original 96-second ambient score. No third-party recordings."""
import math,subprocess,tempfile,wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sr=22050;seconds=96;t=np.arange(sr*seconds)/sr;signal=np.zeros_like(t)
# An original slow Cmaj7 / Am7 / Fmaj7 / Gsus2 progression with soft overtones.
for index,chord in enumerate([(48,55,59,64),(45,52,55,60),(41,48,52,57),(43,50,55,62)]*2):
 start=index*12;local=t-start;mask=(local>=0)&(local<18);x=local[mask]
 env=np.sin(np.pi*np.minimum(x/18,1))**2
 for note in chord:
  f=440*2**((note-69)/12);signal[mask]+=.023*env*(np.sin(2*np.pi*f*x)+.18*np.sin(2*np.pi*2*f*x))
for n,note in enumerate([72,76,79,74,76,72,69,67,72,71,67,74,76,79,76,72]):
 start=3+n*5.5;x=t-start;mask=(x>=0)&(x<9);u=x[mask];f=440*2**((note-69)/12)
 signal[mask]+=.034*(1-np.exp(-u*4))*np.exp(-u*.65)*(np.sin(2*np.pi*f*u)+.10*np.sin(4*np.pi*f*u))
fade=np.minimum(t/3,1)*np.minimum((seconds-t)/5,1);signal*=fade
left=signal;right=.985*signal+.015*np.roll(signal,int(sr*.17));pcm=(np.stack([left,right],axis=1).clip(-.9,.9)*32767).astype('<i2')
with tempfile.TemporaryDirectory() as temp:
 wav=Path(temp)/'score.wav'
 with wave.open(str(wav),'wb')as out:out.setnchannels(2);out.setsampwidth(2);out.setframerate(sr);out.writeframes(pcm.tobytes())
 dest=ROOT/'calendar-app/public/ambient.mp3';subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-codec:a','libmp3lame','-b:a','64k','-metadata','title=Quiet Steps','-metadata','artist=GaryHub','-metadata','comment=Original synthesized score; CC0-1.0',str(dest)],check=True)
 (ROOT/'lab-service/public/ambient.mp3').write_bytes(dest.read_bytes())
print('Original ambient score: 96 seconds, stereo, 64 kbps.')
