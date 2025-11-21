"""
dynamic_grip_module.py

A self-contained Python module implementing a working Dynamic Grip Coefficient (DGC)
and a small demo runner. It supports:
- Loading provided CSVs (if present) or using a synthetic demo dataset
- A baseline, explainable GripIndex estimator
- A simple residual ML model training (RandomForest) if data is available
- A real-time inference function `infer_grip()` you can call repeatedly for live updates
- A CLI demo when run as __main__

To run:
    python3 dynamic_grip_module.py

If you have real CSV files, put them next to this script:
- 26_Weather_Race_1_Anonymized.csv
- 23_AnalysisEnduranceWithSections.csv
- R1_vir_telemetry_data.csv

The script will try to load them; if not found, it runs using synthetic demo data.
"""

import os, math, json
from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib
import warnings
warnings.filterwarnings("ignore")

DATA_DIR = Path(__file__).parent

# -----------------------------
# Config / Calibration Defaults
# -----------------------------
TRACK_TEMP_OPT = 110.0
ALPHA = 0.01
HUMIDITY_OPT = 30.0
BETA = 0.03
GAMMA = 0.05
WIND_THRESH = 10.0
WIND_EFFECT = 2.0
K1 = 0.6   # weight for exit speed residual
K2 = 0.4   # weight for brake point shift
MODEL_PATH = DATA_DIR / "rf_residual_model.joblib"

# -----------------------------
# Utilities
# -----------------------------
def clamp(x, lo, hi):
    return max(lo, min(hi, x))

# -----------------------------
# Baseline Grip Index (explainable)
# -----------------------------
def baseline_grip(track_temp, humidity, cloud_pct=0.0, wind_mph=0.0):
    g = 100.0
    g -= ALPHA * (TRACK_TEMP_OPT - track_temp)**2
    g -= BETA * max(0.0, (humidity - HUMIDITY_OPT))**1.2
    g -= GAMMA * cloud_pct
    if wind_mph > WIND_THRESH:
        g -= WIND_EFFECT
    return clamp(g, 40.0, 110.0)

# -----------------------------
# Residual model training (optional, uses CSVs)
# -----------------------------
def train_residual_model(weather_df, laps_df, telemetry_df, save_path=MODEL_PATH):
    """
    Trains a RandomForest to predict sector time residuals vs baseline.
    Expects:
      weather_df: ['timestamp','TrackTemp_F','AirTemp_F','Humidity_pct','CloudCover_pct','WindSpeed_mph']
      laps_df: ['lap_number','driver_id','sector_id','sector_time','lap_time','timestamp']
      telemetry_df: ['timestamp','driver_id','section_id','exit_speed','mean_pbrake_f','aps_std','brake_point_shift_seconds']
    """
    # Merge laps with nearest weather by timestamp
    weather_df = weather_df.copy()
    laps_df = laps_df.copy()
    telemetry_df = telemetry_df.copy()
    # Ensure timestamp is datetime
    for df in (weather_df, laps_df, telemetry_df):
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])

    # Join weather: for each lap, find closest weather row by timestamp
    weather_df = weather_df.sort_values('timestamp')
    laps_df = laps_df.sort_values('timestamp')
    laps_df['weather_idx'] = laps_df['timestamp'].apply(lambda t: weather_df['timestamp'].sub(t).abs().idxmin())
    laps_df = laps_df.join(weather_df.set_index(weather_df.index), on='weather_idx', rsuffix='_w')

    # Merge telemetry by driver + sector (simple aggregation)
    telemetry_agg = telemetry_df.groupby(['driver_id','section_id']).agg({
        'exit_speed':'mean','mean_pbrake_f':'mean','aps_std':'mean','brake_point_shift_seconds':'mean'
    }).reset_index().rename(columns={'section_id':'sector_id'})
    merged = pd.merge(laps_df, telemetry_agg, how='left', on=['driver_id','sector_id'])

    # Create baseline prediction using baseline_grip -> map to expected sector time via simple linear sensitivity
    # We will convert grip->seconds using a sensitivity: 0.01 grip (1%) ≈ 0.02s per sector (tuneable)
    SENSITIVITY_SEC_PER_GRIP_PCT = 0.02 * 100  # convert to seconds per 1% grip change approximated
    # For label, compute observed sector time and subtract baseline predicted time (we approximate baseline as mean sector time),
    # then train RF to predict residuals based on weather + telemetry features.
    merged['TrackTemp_F'] = merged['TrackTemp_F'].astype(float)
    merged['Humidity_pct'] = merged['Humidity_pct'].astype(float)
    merged['CloudCover_pct'] = merged.get('CloudCover_pct', 0.0).astype(float)
    merged['WindSpeed_mph'] = merged.get('WindSpeed_mph', 0.0).astype(float)

    # Fill telemetry NaNs with group means or zeros
    for col in ['exit_speed','mean_pbrake_f','aps_std','brake_point_shift_seconds']:
        if col not in merged.columns:
            merged[col] = 0.0
        merged[col] = merged[col].fillna(merged[col].mean())

    # Use mean sector time per sector as a simple baseline
    baseline_by_sector = merged.groupby('sector_id')['sector_time'].mean().to_dict()
    merged['baseline_sector_time'] = merged['sector_id'].map(baseline_by_sector)
    merged['residual_sec'] = merged['sector_time'] - merged['baseline_sector_time']

    # Features for RF
    X = merged[['TrackTemp_F','AirTemp_F','Humidity_pct','CloudCover_pct','WindSpeed_mph',
                'exit_speed','mean_pbrake_f','aps_std','brake_point_shift_seconds']].fillna(0)
    y = merged['residual_sec'].values

    # Train RF
    rf = RandomForestRegressor(n_estimators=100, random_state=42)
    rf.fit(X, y)
    joblib.dump({'model': rf, 'baseline_by_sector': baseline_by_sector}, save_path)
    return save_path

# -----------------------------
# Load residual model (if trained)
# -----------------------------
def load_residual_model(path=MODEL_PATH):
    if path.exists():
        obj = joblib.load(path)
        return obj.get('model'), obj.get('baseline_by_sector', {})
    return None, {}

# -----------------------------
# Real-time inference
# -----------------------------
def infer_grip(weather_row, telemetry_summary, baseline_exit_speed=80.0, field_sector_mean_delta=0.0, residual_rf=None):
    """
    weather_row: dict with TrackTemp_F, AirTemp_F, Humidity_pct, CloudCover_pct, WindSpeed_mph
    telemetry_summary: dict with exit_speed, mean_pbrake_f, aps_std, brake_point_shift_seconds, sector_id
    returns: dict with grip_percent, expected_sector_time_change, confidence
    """
    track_temp = float(weather_row.get("TrackTemp_F", TRACK_TEMP_OPT))
    humidity = float(weather_row.get("Humidity_pct", HUMIDITY_OPT))
    cloud = float(weather_row.get("CloudCover_pct", 0.0))
    wind = float(weather_row.get("WindSpeed_mph", 0.0))

    gi_base = baseline_grip(track_temp, humidity, cloud, wind)

    exit_speed = telemetry_summary.get("exit_speed", baseline_exit_speed)
    brake_shift = telemetry_summary.get("brake_point_shift_seconds", 0.0)

    residual_signal = K1 * (baseline_exit_speed - exit_speed) / max(1.0, baseline_exit_speed)
    residual_signal += K2 * (brake_shift)

    gi_corrected = gi_base * (1 - residual_signal)
    gi_corrected = clamp(gi_corrected, 25.0, 110.0)

    expected_sector_time_change = 0.0
    confidence = 0.6

    if residual_rf is not None:
        feat_vector = [[
            track_temp, float(weather_row.get('AirTemp_F', track_temp)),
            humidity, cloud, wind,
            float(exit_speed),
            float(telemetry_summary.get('mean_pbrake_f', 0.0)),
            float(telemetry_summary.get('aps_std', 0.0)),
            float(telemetry_summary.get('brake_point_shift_seconds', 0.0)),
            float(field_sector_mean_delta)
        ]]
        try:
            pred_sec_residual = residual_rf.predict(feat_vector)[0]
            expected_sector_time_change = float(pred_sec_residual)
            # convert seconds to grip percent delta: assume 0.1s -> 1% baseline for sector (tunable)
            grip_percent_delta = -pred_sec_residual * 10.0
            gi_corrected = gi_corrected + grip_percent_delta
            confidence = 0.85
        except Exception:
            # prediction failed, keep baseline
            pass

    gi_corrected = clamp(gi_corrected, 20.0, 130.0)
    return {
        "grip_percent": round(float(gi_corrected), 2),
        "expected_sector_time_change": round(float(expected_sector_time_change), 3),
        "confidence": round(float(confidence), 2)
    }

# -----------------------------
# Small demo utilities / synthetic data
# -----------------------------
def make_synthetic_data(out_dir):
    # Weather: one row per minute for 30 minutes
    times = pd.date_range("2025-11-21 10:00:00", periods=30, freq="T")
    weather = pd.DataFrame({
        "timestamp": times,
        "TrackTemp_F": np.linspace(115, 98, len(times)),  # cooling track
        "AirTemp_F": np.linspace(85, 78, len(times)),
        "Humidity_pct": np.linspace(30, 48, len(times)),
        "CloudCover_pct": np.linspace(10, 50, len(times)),
        "WindSpeed_mph": np.random.normal(6,1,len(times)).clip(0,15)
    })
    weather.to_csv(out_dir / "26_Weather_Race_1_Anonymized.csv", index=False)

    # Laps/sections (synthetic)
    laps = []
    for lap in range(1,21):
        for sector in [1,2,3]:
            laps.append({
                "lap_number": lap,
                "driver_id": 1,
                "sector_id": sector,
                "sector_time": 30 + sector*5 + np.random.normal(0,0.2),
                "lap_time": 100 + np.random.normal(0,0.5),
                "timestamp": times[min(lap-1, len(times)-1)]
            })
    laps_df = pd.DataFrame(laps)
    laps_df.to_csv(out_dir / "23_AnalysisEnduranceWithSections.csv", index=False)

    # Telemetry synthetic aggregated by driver+sector
    tel = []
    for sector in [1,2,3]:
        for lap in range(1,21):
            tel.append({
                "timestamp": times[min(lap-1,len(times)-1)],
                "driver_id": 1,
                "section_id": sector,
                "exit_speed": 85 - sector*2 + np.random.normal(0,0.8),
                "mean_pbrake_f": 0.6 + np.random.normal(0,0.05),
                "aps_std": 0.08 + np.random.normal(0,0.02),
                "brake_point_shift_seconds": np.random.normal(0,0.02)
            })
    tel_df = pd.DataFrame(tel)
    tel_df.to_csv(out_dir / "R1_vir_telemetry_data.csv", index=False)
    return weather, laps_df, tel_df

# -----------------------------
# Demo runner when executed
# -----------------------------
def demo_run(data_dir=DATA_DIR):
    print("=== DYNAMIC GRIP MODULE DEMO ===")
    wd = data_dir / "26_Weather_Race_1_Anonymized.csv"
    ld = data_dir / "23_AnalysisEnduranceWithSections.csv"
    td = data_dir / "R1_vir_telemetry_data.csv"

    if not wd.exists() or not ld.exists() or not td.exists():
        print("Demo CSVs not found - creating synthetic demo data...")
        weather_df, laps_df, telemetry_df = make_synthetic_data(data_dir)
    else:
        weather_df = pd.read_csv(wd)
        laps_df = pd.read_csv(ld)
        telemetry_df = pd.read_csv(td)

    print("Loaded data rows:", len(weather_df), "weather rows;", len(laps_df), "lap rows;", len(telemetry_df), "telemetry rows")

    # Train residual model quickly (small data)
    print("Training residual model (this may take a few seconds)...")
    model_path = train_residual_model(weather_df, laps_df, telemetry_df, save_path=DATA_DIR / "rf_residual_model.joblib")
    print("Trained residual model saved to:", model_path)

    rf, baseline_by_sector = load_residual_model(DATA_DIR / "rf_residual_model.joblib")
    print("Residual model loaded:", rf is not None)

    # Simulate live loop over weather rows and produce grips
    baseline_exit_speed = 85.0
    print("\nSimulating live feed (first 8 weather timesteps):\n")
    for i, row in weather_df.head(8).iterrows():
        t = row.to_dict()
        # pick telemetry summary for sector 2 as example (closest by timestamp)
        tel_row = telemetry_df.iloc[min(i, len(telemetry_df)-1)]
        telemetry_summary = {
            "exit_speed": float(tel_row['exit_speed']),
            "mean_pbrake_f": float(tel_row['mean_pbrake_f']),
            "aps_std": float(tel_row['aps_std']),
            "brake_point_shift_seconds": float(tel_row['brake_point_shift_seconds']),
            "sector_id": int(tel_row['section_id'])
        }
        out = infer_grip(t, telemetry_summary, baseline_exit_speed=baseline_exit_speed, field_sector_mean_delta=0.0, residual_rf=rf)
        print(f"Time {t['timestamp']} -> TRACK_TEMP={t['TrackTemp_F']:.1f}°F, HUM={t['Humidity_pct']:.1f}% -> Grip: {out['grip_percent']}%, expected Δsec: {out['expected_sector_time_change']:+.3f}, conf={out['confidence']}")
    print("\nDemo complete. Module file is ready to use.")

# -----------------------------
# If run as a script, execute demo
# -----------------------------
if __name__ == "__main__":
    demo_run()
