import whisper
import json
import os 
import subprocess



 files = os.listdir("videoes")
for video in videos: 
   tutorial_number = video.split("[]")