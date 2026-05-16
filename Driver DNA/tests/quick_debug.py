import os, sys
import numpy as np
import pandas as pd
MODULE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, MODULE_DIR)
import driver_dna_analysis as dna

# Case 1: ramp
times = np.round(np.arange(0, 6, 0.05), 3)
speed = 60 - (np.exp(-((times-2.0)**2)/0.02) * 30)
aps = np.zeros_like(times)
for i,t in enumerate(times):
    if t >= 2.3:
        aps[i] = min(100, (t-2.3)/0.4*100)
pbrake = np.zeros_like(times)
df = pd.DataFrame({'vehicle_id':['T']*len(times), 'lap':[1]*len(times), 'elapsed_lap_s':times, 'speed':speed, 'aps':aps, 'pbrake_f':pbrake})
df.index = np.arange(len(df))

print('Apex detection...')
start, end = dna.detect_throttle_segment(df)
print('Segment', start, end)
if start is not None:
    seg = df.loc[start:end]
    m = dna.calculate_segment_metrics(seg, 'throttle')
    print('Metrics:', m)

# Case 2: already full
aps2 = np.zeros_like(times)
for i,t in enumerate(times):
    if t >= 2.0 + dna.THROTTLE_POST_APEX_DELAY_S + 0.05:
        aps2[i] = 100

df2 = pd.DataFrame({'vehicle_id':['T']*len(times), 'lap':[1]*len(times), 'elapsed_lap_s':times, 'speed':speed, 'aps':aps2, 'pbrake_f':pbrake})
df2.index = np.arange(len(df2))
start2, end2 = dna.detect_throttle_segment(df2)
print('Segment2', start2, end2)
if start2 is not None:
    seg2 = df2.loc[start2:end2]
    m2 = dna.calculate_segment_metrics(seg2, 'throttle')
    print('Metrics2:', m2)
