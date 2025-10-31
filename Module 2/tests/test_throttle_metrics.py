import unittest
import pandas as pd
import numpy as np

# Import functions under test from the module folder
# Because the folder has a space in its name, use sys.path to import the module by filename
import os, sys
MODULE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, MODULE_DIR)
import driver_dna_analysis as dna
from driver_dna_analysis import detect_throttle_segment, calculate_segment_metrics, THROTTLE_POST_APEX_DELAY_S, THROTTLE_MIN_DURATION_S

class TestThrottleMetrics(unittest.TestCase):
    def _build_df(self, times, speed, aps, pbrake):
        df = pd.DataFrame({
            'vehicle_id': ['TEST']*len(times),
            'lap': [1]*len(times),
            'elapsed_lap_s': times,
            'speed': speed,
            'aps': aps,
            'pbrake_f': pbrake,
        })
        df.index = np.arange(len(times))
        return df

    def test_time_to_full_is_measured_on_clean_ramp(self):
        # Construct a lap with an apex at t=2.0s and APS ramp starting ~2.2s, reaching 95% at 2.6s
        times = np.round(np.arange(0, 6, 0.05), 3)
        speed = 60 - (np.exp(-((times-2.0)**2)/0.02) * 30) # pseudo dip around 2.0s
        aps = np.zeros_like(times)
        # After apex + small delay, ramp from 0->100 between t=2.3..2.7 (clearer threshold crossing)
        for i,t in enumerate(times):
            if t >= 2.3:
                aps[i] = min(100, (t-2.3)/0.4*100)  # 100% reached by 2.7
        pbrake = np.zeros_like(times)
        df = self._build_df(times, speed, aps, pbrake)

        s, e = detect_throttle_segment(df)
        self.assertIsNotNone(s)
        seg = df.loc[s:e]
        m = calculate_segment_metrics(seg, 'throttle')
        # Expect roughly 2.6 - first crossing near 10% (~2.26) ≈ ~0.34s
        ttf = m.get('time_to_full_throttle')
        self.assertTrue(np.isfinite(ttf))
        self.assertGreater(ttf, 0.2)
        self.assertLess(ttf, 0.6)

    def test_already_full_throttle_at_start_reports_nan(self):
        # Apex at 2.0; immediately at 100% after post-apex delay
        times = np.round(np.arange(0, 5, 0.05), 3)
        speed = 60 - (np.exp(-((times-2.0)**2)/0.02) * 30)
        aps = np.zeros_like(times)
        for i,t in enumerate(times):
            if t >= 2.0 + THROTTLE_POST_APEX_DELAY_S + 0.05:  # just after apex+delay
                aps[i] = 100
        pbrake = np.zeros_like(times)
        df = self._build_df(times, speed, aps, pbrake)

        s, e = detect_throttle_segment(df)
        self.assertIsNotNone(s)
        seg = df.loc[s:e]
        m = calculate_segment_metrics(seg, 'throttle')
        self.assertTrue(m.get('already_full_throttle_at_start', False))
        self.assertTrue(np.isnan(m.get('time_to_full_throttle')))

if __name__ == '__main__':
    unittest.main()
