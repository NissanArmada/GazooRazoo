import os
import pandas as pd
import driver_dna_analysis as dna
import sys

# Configuration
BASE_DATA_DIR = r'D:/GR Cupo/GazooRazoo/VIR/Race 1'
TELEMETRY_FILE = os.path.join(BASE_DATA_DIR, 'R1_vir_telemetry_data.csv')
LAP_TIMES_FILE = os.path.join(BASE_DATA_DIR, 'vir_lap_time_R1.csv')
# Try to find sections file
SECTIONS_FILE = None
for f in os.listdir(BASE_DATA_DIR):
    if "Sections" in f and f.endswith(".CSV"):
        SECTIONS_FILE = os.path.join(BASE_DATA_DIR, f)
        break

print(f"Scanning data in: {BASE_DATA_DIR}")
print(f"Telemetry: {os.path.basename(TELEMETRY_FILE)}")
print(f"Laps: {os.path.basename(LAP_TIMES_FILE)}")
print(f"Sections: {os.path.basename(SECTIONS_FILE) if SECTIONS_FILE else 'Not Found'}")

try:
    telemetry_df, lap_times_df, sections_df = dna.load_data(
        telemetry_path=TELEMETRY_FILE,
        lap_times_path=LAP_TIMES_FILE,
        sections_path=SECTIONS_FILE
    )
    
    if lap_times_df is None:
        print("Error: Could not load lap times.")
        sys.exit(1)

    print("\n--- Driver Analysis Scan ---")
    print(f"{'Driver ID':<20} | {'#':<4} | {'Total Laps':<10} | {'Valid Laps':<10} | {'Status'}")
    print("-" * 70)

    unique_ids = lap_times_df['vehicle_id'].unique()
    
    for vid in unique_ids:
        # Extract number if possible
        try:
            # Assuming format GR86-XXX-NUM
            v_num = int(str(vid).split('-')[-1])
        except:
            v_num = 0
            
        # Use the logic from find_optimal_laps but capture the count
        # We can just call find_optimal_laps and check the length of the result
        # But we want to know *why* it failed if it did (e.g. 0 valid laps)
        
        # To avoid spamming stdout from find_optimal_laps, we could suppress it, 
        # but for now let's just run it.
        
        # Actually, find_optimal_laps prints a lot. Let's suppress stdout for the loop.
        # We can't easily suppress it without redirect_stdout which I just added to api.py
        # Let's just run it and see.
        
        # We need to pass the dataframe, not reload it
        optimal_laps = dna.find_optimal_laps(lap_times_df, sections_df, vid, v_num, n=999)
        
        total_laps = len(lap_times_df[lap_times_df['vehicle_id'] == vid])
        valid_laps = len(optimal_laps)
        
        status = "OK" if valid_laps >= 3 else "LOW DATA" if valid_laps > 0 else "NO VALID LAPS"
        
        print(f"{str(vid):<20} | {v_num:<4} | {total_laps:<10} | {valid_laps:<10} | {status}")

except Exception as e:
    print(f"An error occurred: {e}")
