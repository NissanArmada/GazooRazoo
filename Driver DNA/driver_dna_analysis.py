import pandas as pd
import numpy as np
from scipy.interpolate import interp1d
from scipy.signal import find_peaks
import warnings
import os # Import the os module for path manipulation

# --- Configuration ---
# Define the base directory where the CSV files are located
# **** Ensure your CSV files are in this exact 'Race 1' subfolder ****
BASE_DATA_DIR = r'D:/GR Cupo/GazooRazoo/VIR/Race 1' # Use raw string for Windows paths

# Construct full file paths using os.path.join
TELEMETRY_FILE = os.path.join(BASE_DATA_DIR, 'R1_vir_telemetry_data.csv')
LAP_TIMES_FILE = os.path.join(BASE_DATA_DIR, 'vir_lap_time_R1.csv')
SECTIONS_FILE = os.path.join(BASE_DATA_DIR, '23_AnalysisEnduranceWithSections_Race 1_Anonymized.CSV')


# --- Testing multiple drivers ---
TARGET_DRIVERS = [
    {'number': 46, 'id': 'GR86-033-46'},  # Car 46
    {'number': 13, 'id': 'GR86-022-13'},  # Car 13
    {'number': 2, 'id': 'GR86-002-2'},    # Car 2
    {'number': 12, 'id': 'GR86-047-21'}   # Car 12 (appears as #21 in this race)
]

NUM_OPTIMAL_LAPS = 5 # How many fastest laps to use for the baseline DNA
NORMALIZE_POINTS = 30 # Number of points to normalize curves to

# --- Segment Detection Parameters (TUNABLE) ---
BRAKE_THRESHOLD = 10 # Min pbrake_f to detect start/end of braking
BRAKE_MIN_PEAK_HEIGHT = 40 # Minimum peak brake pressure to consider it significant
BRAKE_MIN_DURATION_S = 0.8 # Minimum duration for a braking zone to be considered

THROTTLE_THRESHOLD = 5.0 # Min aps to detect start of application (absolute, 0-100 scale)
THROTTLE_POST_APEX_DELAY_S = 0.1 # Look for throttle increase slightly *after* min speed
THROTTLE_MIN_DURATION_S = 1.0 # Minimum duration for throttle application zone
# Include a small pre-roll before detected throttle start so ramp-up is captured
THROTTLE_PREROLL_S = 0.3 # seconds of data to include before detected start for metrics

# --- Alert Thresholds (TUNABLE) ---
PEAK_BRAKE_DEV_THRESHOLD = 0.20 # 20% deviation
BRAKE_DURATION_DEV_THRESHOLD = 0.25 # 25% deviation
THROTTLE_SMOOTHNESS_DEV_THRESHOLD = 0.50 # 50% increase in std dev (worse)
SHAPE_DIFF_THRESHOLD_MSE = 1500.0 # Mean Squared Error threshold for curve shape difference (0-100 scale)

# --- Debugging Flag ---
DETAILED_DEBUG = False # Set to True to print detailed segment info during baseline calculation

# --- Helper Functions ---

def load_data():
    """Loads and preprocesses the required CSV files."""
    try:
        # Check if files exist before attempting to load
        if not os.path.exists(TELEMETRY_FILE):
            raise FileNotFoundError(f"Telemetry file not found: {TELEMETRY_FILE}")
        if not os.path.exists(LAP_TIMES_FILE):
             raise FileNotFoundError(f"Lap times file not found: {LAP_TIMES_FILE}")
        if not os.path.exists(SECTIONS_FILE):
             raise FileNotFoundError(f"Sections file not found: {SECTIONS_FILE}")

        telemetry_df = pd.read_csv(TELEMETRY_FILE, low_memory=False)
        lap_times_df = pd.read_csv(LAP_TIMES_FILE)

        # --- Clean column names by stripping whitespace ---
        lap_times_df.columns = lap_times_df.columns.str.strip()
        telemetry_df.columns = telemetry_df.columns.str.strip()
        # --- End cleaning ---

        # Specify separator for sections file
        sections_df = pd.read_csv(SECTIONS_FILE, sep=';', low_memory=False)
        # --- Clean section column names ---
        sections_df.columns = sections_df.columns.str.strip()
        # --- End cleaning ---

        # --- More Robust Data Cleaning ---
        # Strip whitespace from object columns that might be used for filtering/joining
        for df in [lap_times_df, telemetry_df, sections_df]:
            # Convert object columns to string type before stripping to avoid errors
            for col in df.select_dtypes(include=['object']).columns:
                df[col] = df[col].astype(str).str.strip()

        # Convert 'lap'/'LAP_NUMBER' to numeric, coercing errors
        if 'lap' in lap_times_df.columns:
            lap_times_df['lap'] = pd.to_numeric(lap_times_df['lap'], errors='coerce')
            lap_times_df.dropna(subset=['lap'], inplace=True) # Drop rows where lap couldn't be converted
            lap_times_df['lap'] = lap_times_df['lap'].astype(int)
        if 'lap' in telemetry_df.columns:
             telemetry_df['lap'] = pd.to_numeric(telemetry_df['lap'], errors='coerce')
             telemetry_df.dropna(subset=['lap'], inplace=True)
             telemetry_df['lap'] = telemetry_df['lap'].astype(int)
        if 'LAP_NUMBER' in sections_df.columns:
             sections_df['LAP_NUMBER'] = pd.to_numeric(sections_df['LAP_NUMBER'], errors='coerce')
             sections_df.dropna(subset=['LAP_NUMBER'], inplace=True)
             sections_df['LAP_NUMBER'] = sections_df['LAP_NUMBER'].astype(int)
        if 'NUMBER' in sections_df.columns: # Also clean driver number just in case
             sections_df['NUMBER'] = pd.to_numeric(sections_df['NUMBER'], errors='coerce')
             sections_df.dropna(subset=['NUMBER'], inplace=True)
             sections_df['NUMBER'] = sections_df['NUMBER'].astype(int)
        # --- End Robust Data Cleaning ---


        # Convert timestamps and calculate elapsed seconds within lap
        telemetry_df['timestamp'] = pd.to_datetime(telemetry_df['timestamp'], errors='coerce')
        telemetry_df = telemetry_df.sort_values(by=['vehicle_id', 'lap', 'timestamp']).dropna(subset=['timestamp'])

        # Group by lap to calculate elapsed time from lap start
        telemetry_df['lap_start_time'] = telemetry_df.groupby(['vehicle_id', 'lap'])['timestamp'].transform('min')
        telemetry_df['elapsed_lap_s'] = (telemetry_df['timestamp'] - telemetry_df['lap_start_time']).dt.total_seconds()

        # Pivot telemetry for easier access
        telemetry_pivot = telemetry_df.pivot_table(
            index=['vehicle_id', 'lap', 'elapsed_lap_s'],
            columns='telemetry_name',
            values='telemetry_value'
        ).reset_index()
        telemetry_pivot.columns.name = None # Remove the columns' name after pivot

        # Ensure essential columns exist, filling missing with 0 or NaN where appropriate
        pivoted_cols = telemetry_pivot.columns
        for col in ['Speed', 'pbrake_f', 'pbrake_r', 'aps', 'Steering_Angle', 'gear']:
            col_lower = col.lower() # Target column name is lowercase
            col_found = False
            found_name = None
            for pc in pivoted_cols:
                if pc.lower() == col_lower:
                    col_found = True
                    found_name = pc
                    break
            if col_found:
                 # Rename if case differs (e.g., Speed -> speed)
                 if found_name != col_lower:
                      telemetry_pivot.rename(columns={found_name: col_lower}, inplace=True)
            else:
                # print(f"Warning: Column '{col}' not found after pivot. Adding column '{col_lower}' with 0s.")
                telemetry_pivot[col_lower] = 0 # Default non-critical sensors to 0 if missing

        # Map common telemetry name aliases to the standardized names used throughout
        # e.g., some datasets use 'ath' instead of 'aps' for accelerator position.
        alias_map = {
            'ath': 'aps',
            'throttle': 'aps',
            'accelerator': 'aps',
            'acc_pedal': 'aps',
            'speed_kph': 'speed',
            'speed_mps': 'speed',
            'pbrake_front': 'pbrake_f',
            'pbrake_rear': 'pbrake_r'
        }
        for src, dst in alias_map.items():
            # find any column that matches the alias (case-insensitive)
            for col_name in list(telemetry_pivot.columns):
                if col_name.lower() == src:
                    # Prefer real data from the source alias if it contains non-zero/non-NaN values.
                    try:
                        numeric_vals = pd.to_numeric(telemetry_pivot[col_name], errors='coerce').fillna(0)
                    except Exception:
                        numeric_vals = telemetry_pivot[col_name]

                    # If source alias has any non-zero measurements, use it to populate the dst column
                    try:
                        has_data = numeric_vals.abs().sum() > 0
                    except Exception:
                        has_data = not telemetry_pivot[col_name].isna().all()

                    if has_data:
                        telemetry_pivot[dst] = numeric_vals
                    else:
                        # If dst doesn't exist yet, create it from source (may be zeros/NaNs)
                        if dst not in telemetry_pivot.columns:
                            telemetry_pivot[dst] = telemetry_pivot[col_name]

                    # Drop the alias column to avoid duplicates
                    telemetry_pivot.drop(columns=[col_name], inplace=True, errors='ignore')

        # Ensure that 'aps' exists (accelerator) - keep NaNs if missing so detection can fall back
        if 'aps' not in telemetry_pivot.columns:
            telemetry_pivot['aps'] = np.nan
        # Ensure 'speed' column exists after potential rename
        if 'speed' not in telemetry_pivot.columns:
             print("Warning: 'speed' column missing after pivot and checks. Adding 'speed' column with 0s.")
             telemetry_pivot['speed'] = 0


        # Clean lap times (using the now cleaned 'value' column)
        def time_str_to_seconds(time_str):
            # --- Combined robust parsing ---
            try:
                if pd.isna(time_str): return np.nan
                if isinstance(time_str, (int, float)): 
                    # Convert milliseconds to seconds if the number is large
                    return float(time_str) / 1000.0 if float(time_str) > 5000 else float(time_str)

                time_str_cleaned = str(time_str).strip()

                # Handle potential milliseconds first if it's just digits
                if time_str_cleaned.isdigit():
                    ms = int(time_str_cleaned)
                    return ms / 1000.0 # Always treat numeric strings as milliseconds

                # Handle colon format
                parts = time_str_cleaned.split(':')
                if len(parts) == 2:
                    return float(parts[0]) * 60 + float(parts[1])
                elif len(parts) == 1:
                     # Handle seconds.milliseconds format or just seconds
                     return float(parts[0])

            except (ValueError, TypeError):
                return np.nan
            return np.nan # Fallback
            # --- End combined parsing ---

        # --- Access the cleaned 'value' column ---
        if 'value' not in lap_times_df.columns:
            raise ValueError(f"Cleaned column 'value' not found in {LAP_TIMES_FILE}. Found columns: {lap_times_df.columns.tolist()}")

        lap_times_df['lap_time_s'] = lap_times_df['value'].apply(time_str_to_seconds)
        # --- End accessing cleaned column ---

        # Drop rows where lap time conversion failed
        initial_rows = len(lap_times_df)
        lap_times_df = lap_times_df.dropna(subset=['lap_time_s'])
        if len(lap_times_df) < initial_rows:
            print(f"Warning: Dropped {initial_rows - len(lap_times_df)} rows from lap_times_df due to conversion errors in 'value' column.")

        # Filter unrealistic lap times (e.g., zeros, very short laps, or obvious outliers)
        before_filter = len(lap_times_df)
        # Remove lap times that are zero or unrealistically short (< 20s)
        lap_times_df = lap_times_df[lap_times_df['lap_time_s'] > 20]
        # Remove obviously invalid lap numbers (some datasets include marker rows like 32768)
        if 'lap' in lap_times_df.columns:
            lap_times_df = lap_times_df[lap_times_df['lap'].between(1, 500)]
        after_filter = len(lap_times_df)
        if after_filter < before_filter:
            print(f"Info: Filtered out {before_filter - after_filter} unrealistic/invalid lap time rows (<=20s or invalid lap numbers).")


        # Clean sections data - Convert time strings and handle potential errors (using cleaned column names)
        for col in ['LAP_TIME', 'S1_SECONDS', 'S2_SECONDS', 'S3_SECONDS']:
             if col in sections_df.columns: # Check using cleaned names
                  # Use apply with error handling for robustness
                  # Convert comma decimal separator if present
                  if sections_df[col].dtype == 'object':
                       # Ensure it's string data before using .str
                       sections_df[col] = sections_df[col].astype(str).str.replace(',', '.', regex=False)
                  sections_df[col] = pd.to_numeric(sections_df[col], errors='coerce')


        # Add vehicle_id to sections_df if possible (Requires understanding the mapping)
        # Placeholder: If NUMBER directly maps or if vehicle_id can be inferred
        # sections_df['vehicle_id'] = sections_df['NUMBER'].apply(lambda x: f"GR86-XXX-{x}") # ADJUST MAPPING
        # For now, we will filter sections_df by NUMBER and assume lap times are reliable

        print("Data loaded successfully.")
        return telemetry_pivot, lap_times_df, sections_df

    except FileNotFoundError as e:
        print(f"Error loading data: {e}. Please check the BASE_DATA_DIR ('{BASE_DATA_DIR}') and file names.")
        return None, None, None
    except KeyError as e:
        print(f"Error processing data: Missing expected column {e}. Check CSV headers and cleaning steps.")
        # Print columns again if error happens after the initial debug print
        if 'lap_times_df' in locals():
            print("Columns in lap_times_df:", lap_times_df.columns.tolist())
        return None, None, None
    except ValueError as e: # Catch the specific error we added
         print(f"Error processing data: {e}")
         return None, None, None
    except Exception as e:
        print(f"An unexpected error occurred during data loading or processing: {e}")
        return None, None, None


# ... (rest of the functions remain the same - ensure they use cleaned column names like 'lap', 'vehicle_id', 'pbrake_f', 'aps', 'speed', etc.) ...

def find_optimal_laps(lap_times_df, sections_df, vehicle_id, vehicle_number, n=NUM_OPTIMAL_LAPS):
    """Identifies the fastest N valid laps for a driver."""
    # Ensure column names are clean before filtering
    if 'vehicle_id' not in lap_times_df.columns or 'lap' not in lap_times_df.columns:
        print("Error: Required columns ('vehicle_id', 'lap') not found in lap_times_df.")
        return []

    # --- Debugging ---
    print(f"\n--- Debugging find_optimal_laps for {vehicle_id} (Number: {vehicle_number}) ---")
    all_laps_for_id = lap_times_df[lap_times_df['vehicle_id'] == vehicle_id].copy()
    if all_laps_for_id.empty:
        print(f"CRITICAL WARNING: No rows found for vehicle_id '{vehicle_id}' in lap_times_df AT ALL.")
        # Check for similar IDs
        similar_ids = [vid for vid in lap_times_df['vehicle_id'].unique() if vehicle_id[:8] in vid] # Check prefix
        if similar_ids: print(f"  Did you mean one of these?: {similar_ids}")
        print("------------------------------------------")
        return []
    print(f"Initial laps found in lap_times_df for {vehicle_id}: {sorted(all_laps_for_id['lap'].unique())}")
    # --- End Debugging ---

    driver_laps = all_laps_for_id # Use the already filtered data

    # Get laps with FCY flags from sections data
    fcy_laps = set()
    driver_sections = pd.DataFrame() # Initialize
    if sections_df is not None:
         # Filter sections_df by vehicle *number* (assuming 'NUMBER' is cleaned)
         if 'NUMBER' in sections_df.columns and 'FLAG_AT_FL' in sections_df.columns and 'LAP_NUMBER' in sections_df.columns:
             # Ensure NUMBER column is numeric for comparison
             if pd.api.types.is_numeric_dtype(sections_df['NUMBER']):
                 driver_sections = sections_df[sections_df['NUMBER'] == vehicle_number].copy()
                 if not driver_sections.empty:
                     # --- Robust FCY Check: Strip whitespace from flag values ---
                     driver_sections['FLAG_AT_FL_CLEAN'] = driver_sections['FLAG_AT_FL'].astype(str).str.strip().str.upper() # Use upper case for consistency
                     fcy_rows = driver_sections[driver_sections['FLAG_AT_FL_CLEAN'] == 'FCY']
                     fcy_laps = set(fcy_rows['LAP_NUMBER'].unique())
                     print(f"Laps identified as FCY for number {vehicle_number}: {fcy_laps}")
                     # --- Debugging: Show all flags found ---
                     if DETAILED_DEBUG:
                         print(f"All flags found for driver {vehicle_number}: {driver_sections[['LAP_NUMBER', 'FLAG_AT_FL_CLEAN']].value_counts().sort_index()}")
                     # --- End Debugging ---
                 else:
                     print(f"Warning: No rows found for NUMBER {vehicle_number} in sections_df.")

             else:
                  print("Warning: 'NUMBER' column in sections_df is not numeric, cannot filter FCY laps reliably by number.")
         else:
             print("Warning: Could not find required columns ('NUMBER', 'FLAG_AT_FL', 'LAP_NUMBER') in sections_df for FCY filtering.")
    else:
        print("Warning: sections_df is None, cannot filter FCY laps.")


    # Filter out Lap 1 and FCY laps (using cleaned 'lap' column)
    laps_before_filter = sorted(driver_laps['lap'].unique())
    # --- Filter Lap 1 ---
    driver_laps_post_lap1 = driver_laps[driver_laps['lap'] > 1]
    laps_after_lap1_filter = sorted(driver_laps_post_lap1['lap'].unique())
    print(f"Laps after filtering Lap 1: {laps_after_lap1_filter}")
    # --- Filter FCY ---
    driver_laps_post_fcy = driver_laps_post_lap1[~driver_laps_post_lap1['lap'].isin(fcy_laps)]
    laps_after_fcy_filter = sorted(driver_laps_post_fcy['lap'].unique())
    print(f"Laps after filtering FCY ({fcy_laps}): {laps_after_fcy_filter}")


    # Check if any laps remain after filtering
    if driver_laps_post_fcy.empty:
        print(f"Warning: No valid laps found for {vehicle_id} after filtering FCY/Lap 1.")
        print("------------------------------------------")
        return []

    # Sort by time and select top N
    optimal_laps_df = driver_laps_post_fcy.sort_values('lap_time_s').head(n)
    optimal_lap_numbers = optimal_laps_df['lap'].tolist()
    print(f"Identified Optimal Laps for {vehicle_id}: {optimal_lap_numbers}")
    if DETAILED_DEBUG:
        print("Optimal Lap Times (s):")
        print(optimal_laps_df[['lap', 'lap_time_s']])
    print("------------------------------------------")
    return optimal_lap_numbers

def detect_braking_segment(lap_telemetry):
    """Finds the most significant braking zone in a lap's telemetry."""
    # Ensure pbrake_f exists (cleaned name)
    if 'pbrake_f' not in lap_telemetry.columns:
        # print("Warning: 'pbrake_f' not found for braking segment detection.")
        return None, None

    # Ensure pbrake_f is numeric
    lap_telemetry['pbrake_f'] = pd.to_numeric(lap_telemetry['pbrake_f'], errors='coerce')
    lap_telemetry = lap_telemetry.dropna(subset=['pbrake_f']) # Drop rows where conversion failed

    braking_indices = lap_telemetry.index[lap_telemetry['pbrake_f'] > BRAKE_THRESHOLD]
    if len(braking_indices) < 2: return None, None # Not enough data

    segments = []
    start_idx = braking_indices[0]
    for i in range(1, len(braking_indices)):
        # If gap between braking points is large, it's a new segment
        # Check if indices exist before accessing telemetry
        if braking_indices[i] in lap_telemetry.index and braking_indices[i-1] in lap_telemetry.index:
            # Check time difference instead of assuming contiguous indices
            time_diff = lap_telemetry.loc[braking_indices[i], 'elapsed_lap_s'] - lap_telemetry.loc[braking_indices[i-1], 'elapsed_lap_s']
            if time_diff > 0.5: # If more than 0.5s gap between braking data points, assume new segment
                if start_idx <= braking_indices[i-1]: segments.append((start_idx, braking_indices[i-1]))
                start_idx = braking_indices[i]
        else: # Handle missing indices - end previous segment, start new if possible
             # Check if previous index is valid before adding segment
             if start_idx is not None and braking_indices[i-1] in lap_telemetry.index and start_idx <= braking_indices[i-1]:
                  segments.append((start_idx, braking_indices[i-1]))
             # Only reset start_idx if current index is valid
             if braking_indices[i] in lap_telemetry.index:
                 start_idx = braking_indices[i]
             else: # If current index is invalid, we can't start a new segment from here
                  start_idx = None # Mark as invalid start
                  break # Cannot continue reliably

    # Add the last segment if valid and index exists
    if start_idx is not None and braking_indices[-1] in lap_telemetry.index and start_idx <= braking_indices[-1]:
         segments.append((start_idx, braking_indices[-1]))

    max_peak = 0
    best_segment = None
    for start, end in segments:
        # Ensure start and end indices are valid and in order
        if start not in lap_telemetry.index or end not in lap_telemetry.index or start > end: continue

        segment_data = lap_telemetry.loc[start:end]
        if segment_data.empty or len(segment_data) < 2: continue # Skip empty/single-point segments

        # Ensure 'elapsed_lap_s' exists and is numeric
        if 'elapsed_lap_s' not in segment_data.columns or not pd.api.types.is_numeric_dtype(segment_data['elapsed_lap_s']): continue

        # Safely calculate duration
        try:
             duration = segment_data['elapsed_lap_s'].iloc[-1] - segment_data['elapsed_lap_s'].iloc[0]
             if pd.isna(duration) or duration < 0: continue
        except IndexError:
             continue # Skip if iloc fails

        peak_pressure = segment_data['pbrake_f'].max()
        if pd.isna(peak_pressure): continue # Skip if peak is NaN

        if duration >= BRAKE_MIN_DURATION_S and peak_pressure >= BRAKE_MIN_PEAK_HEIGHT:
            if peak_pressure > max_peak:
                max_peak = peak_pressure
                best_segment = (start, end)

    if best_segment:
        return best_segment
    else:
        # print("No significant braking segment found.")
        return None, None

def detect_throttle_segment(lap_telemetry):
    """Finds a significant throttle application zone after an apex."""
    try:
        # Check for 'speed' and 'aps' column existence (cleaned names)
        has_speed = 'speed' in lap_telemetry.columns
        has_aps = 'aps' in lap_telemetry.columns
        if not has_aps:
            if DETAILED_DEBUG:
                print("Warning: 'aps' column not found for throttle detection. Skipping throttle segment detection.")
            return None, None

        # Ensure columns are numeric, coercing errors to NaN
        if 'speed' in lap_telemetry.columns:
            lap_telemetry['speed'] = pd.to_numeric(lap_telemetry['speed'], errors='coerce')
        lap_telemetry['aps'] = pd.to_numeric(lap_telemetry['aps'], errors='coerce')
        if 'pbrake_f' in lap_telemetry.columns:
            lap_telemetry['pbrake_f'] = pd.to_numeric(lap_telemetry['pbrake_f'], errors='coerce')


    # Attempt to find apex using speed if available
        potential_apexes = []
        if has_speed:
            speed_filled = lap_telemetry['speed'].fillna(method='ffill').fillna(method='bfill')
            if not speed_filled.isna().all():
                potential_apexes_indices = find_peaks(-speed_filled, distance=50)[0] # distance=50 samples apart
                potential_apexes = lap_telemetry.index[potential_apexes_indices].tolist()
                if len(potential_apexes) == 0:
                    # Fallback: lowest speed point
                    try:
                        min_speed_idx = speed_filled.idxmin()
                        if pd.notna(min_speed_idx): potential_apexes = [min_speed_idx]
                    except Exception:
                        potential_apexes = []

        # If no apex from speed, try using aps minima (local minimum of throttle before application)
        if not potential_apexes:
            try:
                aps_filled = lap_telemetry['aps'].fillna(method='ffill').fillna(method='bfill')
                # Quick scale normalization: if aps is 0..1 scale, convert to 0..100
                if aps_filled.max() <= 1.0:
                    if DETAILED_DEBUG: print("Debug: APS appears 0-1 scale, converting to 0-100.")
                    aps_filled = aps_filled * 100.0
                # Smooth small noise to help minima/peak finding
                aps_sm = aps_filled.rolling(window=3, min_periods=1, center=True).mean()
                if not aps_filled.isna().all():
                    aps_minima = find_peaks(-aps_sm, distance=30)[0]
                    if aps_minima.size > 0:
                        potential_apexes = lap_telemetry.index[aps_minima].tolist()
            except Exception:
                potential_apexes = []

        # Final fallback: use braking peak as an indicator of apex (end of braking)
        if not potential_apexes and 'pbrake_f' in lap_telemetry.columns:
            try:
                pb = lap_telemetry['pbrake_f'].fillna(0)
                if not pb.isna().all():
                    peak_idx = pb.idxmax()
                    if pd.notna(peak_idx):
                        # choose a point shortly after the brake peak as apex
                        possible_idxs = lap_telemetry.index.get_loc(peak_idx)
                        # map to integer location and add small offset
                        loc = possible_idxs if isinstance(possible_idxs, int) else (possible_idxs.start if hasattr(possible_idxs, 'start') else None)
                        if loc is not None:
                            # try to pick index + 1 safely
                            try:
                                apex_idx = lap_telemetry.index[loc + 1]
                                potential_apexes = [apex_idx]
                            except Exception:
                                potential_apexes = [peak_idx]
            except Exception:
                potential_apexes = []

        best_segment = None
        max_duration = 0

        if DETAILED_DEBUG:
            print(f"Debug: potential_apexes (count={len(potential_apexes)}): {potential_apexes[:5]}")

        for apex_idx in potential_apexes:
             # Ensure apex_idx is a valid index in the DataFrame
             if apex_idx not in lap_telemetry.index: continue

            # Look for throttle application starting slightly after the apex
             post_apex_data = lap_telemetry.loc[apex_idx:].copy()
             if post_apex_data.empty or len(post_apex_data) < 2: continue

             # Ensure needed columns are present and numeric
             if 'elapsed_lap_s' not in post_apex_data.columns or 'aps' not in post_apex_data.columns: continue
             post_apex_data = post_apex_data.dropna(subset=['elapsed_lap_s', 'aps'])
             if post_apex_data.empty: continue

             post_apex_data['time_after_apex'] = post_apex_data['elapsed_lap_s'] - post_apex_data['elapsed_lap_s'].iloc[0]

             # Normalize aps in post_apex_data if it's 0..1 scale
             aps_vals = post_apex_data['aps'].fillna(method='ffill').fillna(method='bfill')
             if not aps_vals.empty and aps_vals.max() <= 1.0:
                 aps_vals = aps_vals * 100.0
             # Use smoothed aps for threshold checks
             aps_vals_sm = aps_vals.rolling(window=3, min_periods=1, center=True).mean()

             if DETAILED_DEBUG:
                 print(f"Debug: Checking post-apex data: len={len(post_apex_data)}, time_after_apex range={post_apex_data['time_after_apex'].min():.3f}-{post_apex_data['time_after_apex'].max():.3f}, aps_sm range={aps_vals_sm.min():.1f}-{aps_vals_sm.max():.1f}")
             start_throttle_series = post_apex_data[(aps_vals_sm > THROTTLE_THRESHOLD) & (post_apex_data['time_after_apex'] > THROTTLE_POST_APEX_DELAY_S)]
             if start_throttle_series.empty:
                 # Fallback: look for first noticeable positive slope in APS after apex
                 aps_diff = aps_vals_sm.diff().fillna(0)
                 slope_start = post_apex_data[(aps_diff > 0.5) & (post_apex_data['time_after_apex'] > 0.05)]
                 if not slope_start.empty:
                     start_throttle_series = slope_start.iloc[:1]
                     if DETAILED_DEBUG:
                         print(f"Debug: Using slope-based start at idx={start_throttle_series.index[0]}")
             if DETAILED_DEBUG and start_throttle_series.empty:
                 max_aps = aps_vals_sm.max() if not aps_vals_sm.empty else np.nan
                 print(f"Debug: No throttle start found after apex {apex_idx}. max APS after apex={max_aps}, THROTTLE_THRESHOLD={THROTTLE_THRESHOLD}, POST_APEX_DELAY={THROTTLE_POST_APEX_DELAY_S}")

             if not start_throttle_series.empty:
                 start_idx = start_throttle_series.index[0]
                 if DETAILED_DEBUG:
                     print(f"Debug: Found start_idx={start_idx}")
                 # Ensure start_idx is valid
                 if start_idx not in lap_telemetry.index:
                     if DETAILED_DEBUG:
                         print(f"Debug: start_idx {start_idx} not in lap_telemetry index, skipping")
                     continue

                
                 # Find where throttle application ends (plateaus near 100 or braking starts)
                 # Look beyond start_idx by skipping the first sample
                 start_loc = lap_telemetry.index.get_loc(start_idx)
                 if start_loc + 1 >= len(lap_telemetry):
                     continue
                 next_idx = lap_telemetry.index[start_loc + 1]
                 segment_data_after_start = lap_telemetry.loc[next_idx:].copy() # Start from next sample
                 segment_data_after_start = segment_data_after_start.dropna(subset=['aps', 'pbrake_f']) # Drop NaNs needed for end condition
                 if segment_data_after_start.empty or len(segment_data_after_start) < 2: continue

                 end_idx_series = segment_data_after_start[ (segment_data_after_start['aps'] < THROTTLE_THRESHOLD * 5) | (segment_data_after_start['pbrake_f'] > BRAKE_THRESHOLD * 0.5) ] # Looser end condition

                 end_idx = end_idx_series.index[0] if not end_idx_series.empty else segment_data_after_start.index[-1]
                 if DETAILED_DEBUG:
                     print(f"Debug: end_idx={end_idx}")
                 # Ensure end_idx is valid
                 if end_idx not in lap_telemetry.index:
                     if DETAILED_DEBUG:
                         print(f"Debug: end_idx {end_idx} not in lap_telemetry, skipping")
                     continue

                 # Ensure start_idx <= end_idx
                 if start_idx > end_idx:
                     if DETAILED_DEBUG:
                         print(f"Debug: start_idx > end_idx ({start_idx} > {end_idx}), skipping")
                     continue

                 current_segment_data = lap_telemetry.loc[start_idx:end_idx]
                 if current_segment_data.empty or len(current_segment_data) < 2: continue

                 # Safely calculate duration
                 try:
                     duration = current_segment_data['elapsed_lap_s'].iloc[-1] - current_segment_data['elapsed_lap_s'].iloc[0]
                     if DETAILED_DEBUG:
                         st = current_segment_data['elapsed_lap_s'].iloc[0]
                         en = current_segment_data['elapsed_lap_s'].iloc[-1]
                         print(f"Debug: Candidate throttle segment start_idx={start_idx}, end_idx={end_idx}, t_start={st:.3f}, t_end={en:.3f}, duration={duration:.3f}")
                     if pd.isna(duration) or duration < 0: continue # Skip invalid durations
                 except IndexError:
                     continue

                 if duration >= THROTTLE_MIN_DURATION_S:
                      # Back up the start a little (pre-roll) but not before apex
                      try:
                          start_time = lap_telemetry.loc[start_idx, 'elapsed_lap_s']
                          target_time = start_time - THROTTLE_PREROLL_S
                          # Clip to at/after apex time
                          apex_time = lap_telemetry.loc[apex_idx, 'elapsed_lap_s'] if 'elapsed_lap_s' in lap_telemetry.columns else start_time
                          target_time = max(target_time, apex_time)
                          pre_slice = lap_telemetry[(lap_telemetry['elapsed_lap_s'] >= target_time) & (lap_telemetry.index <= start_idx)]
                          segment_start_idx = pre_slice.index[0] if not pre_slice.empty else start_idx
                      except Exception:
                          segment_start_idx = start_idx

                      if duration > max_duration: # Choose the longest valid segment
                          max_duration = duration
                          best_segment = (segment_start_idx, end_idx)
                          if DETAILED_DEBUG:
                              print(f"Debug: Selected best throttle segment indices=({segment_start_idx},{end_idx}) duration={duration:.3f}")

        if best_segment:
            return best_segment
        else:
            # print("No significant throttle segment found.")
            return None, None

    except Exception as e:
        # Catch potential errors during peak finding or indexing
        if DETAILED_DEBUG:
            print(f"Error in detect_throttle_segment: {e}")
        return None, None


def normalize_curve(curve_data, num_points=NORMALIZE_POINTS):
    """Normalizes the length of a telemetry curve using interpolation."""
    curve_data_np = np.array(curve_data) # Ensure numpy array
    if curve_data_np is None or len(curve_data_np) < 2:
        return np.full(num_points, np.nan) # Return NaNs if not enough data

    # Check for NaNs or Infs that would break interpolation
    nan_mask = np.isnan(curve_data_np) | np.isinf(curve_data_np)
    if nan_mask.all(): # All values are NaN/Inf
         return np.full(num_points, np.nan)

    if nan_mask.any():
        # Option 1: Fill NaNs/Infs (e.g., with forward fill, backward fill, or mean)
        # Simple linear interpolation for NaNs
        x_nan = np.flatnonzero(nan_mask)
        x_not_nan = np.flatnonzero(~nan_mask)
        if len(x_not_nan) < 1: # Cannot interpolate if no valid points exist
            return np.full(num_points, np.nan)

        curve_data_np[nan_mask] = np.interp(x_nan, x_not_nan, curve_data_np[x_not_nan])
        # If still NaNs (e.g., at edges), use fill_value='extrapolate' or handle later
        if np.isnan(curve_data_np).any():
             # print("Warning: NaNs remain after interp; using ffill/bfill")
             temp_series = pd.Series(curve_data_np)
             curve_data_np = temp_series.fillna(method='ffill').fillna(method='bfill').values
             if np.isnan(curve_data_np).any(): # Still NaNs? Return NaN array
                  # print("Warning: Could not fully fill NaNs in curve data.")
                  return np.full(num_points, np.nan)

    original_indices = np.linspace(0, 1, len(curve_data_np))
    target_indices = np.linspace(0, 1, num_points)

    try:
        # Use linear interpolation, handle potential NaN by setting bounds_error=False
        interp_func = interp1d(original_indices, curve_data_np, kind='linear', fill_value="extrapolate", bounds_error=False)

        normalized = interp_func(target_indices)

        # Ensure values stay within reasonable bounds (e.g., 0-100 for aps/brake pressure if applicable)
        min_val = np.nanmin(curve_data_np) # Use original cleaned data for bounds
        max_val = np.nanmax(curve_data_np)
        if not np.isnan(min_val) and not np.isnan(max_val):
            # Clip, but handle cases where min/max might still be NaN if original data was bad
             normalized = np.clip(normalized, min_val if pd.notna(min_val) else -np.inf,
                                            max_val if pd.notna(max_val) else np.inf)

        # Final check for NaNs in output
        if np.isnan(normalized).any():
             # print("Warning: NaNs found in normalized curve, attempting fill.")
             temp_series_norm = pd.Series(normalized)
             normalized = temp_series_norm.fillna(method='ffill').fillna(method='bfill').values
             # If still NaN, something is very wrong
             if np.isnan(normalized).any():
                  # print("Error: Final normalized curve contains NaNs.")
                  return np.full(num_points, np.nan)

        return normalized
    except ValueError as e:
        # print(f"Warning: Interpolation failed - {e}. Returning NaN array.")
        return np.full(num_points, np.nan)


def calculate_segment_metrics(segment_data, segment_type):
    """Calculates key metrics for a given telemetry segment."""
    if segment_data is None or segment_data.empty or len(segment_data) < 2:
        return {}

    metrics = {}
    try:
        # Ensure 'elapsed_lap_s' exists and calculate duration safely
        if 'elapsed_lap_s' in segment_data.columns and pd.api.types.is_numeric_dtype(segment_data['elapsed_lap_s']):
            # Ensure index is unique before using iloc
            segment_data = segment_data.loc[~segment_data.index.duplicated(keep='first')]
            duration = segment_data['elapsed_lap_s'].iloc[-1] - segment_data['elapsed_lap_s'].iloc[0]
            if pd.isna(duration) or duration < 0: duration = np.nan # Basic validity check
        else: duration = np.nan
        # --- FIX: Use unique keys ---
        metrics[f'{segment_type}_duration'] = duration
        # --- End FIX ---


        if segment_type == 'braking':
            if 'pbrake_f' in segment_data.columns:
                peak_pressure = segment_data['pbrake_f'].max()
                metrics['peak_brake_f'] = peak_pressure if pd.notna(peak_pressure) else 0

                time_to_peak = np.nan
                if pd.notna(peak_pressure) and peak_pressure > 0:
                     peak_rows = segment_data[segment_data['pbrake_f'] == peak_pressure]
                     if not peak_rows.empty and 'elapsed_lap_s' in peak_rows.columns:
                          # Ensure indices are valid before iloc
                          if len(segment_data) > 0 and len(peak_rows) > 0:
                              start_time = segment_data['elapsed_lap_s'].iloc[0]
                              peak_time = peak_rows['elapsed_lap_s'].iloc[0]
                              if pd.notna(start_time) and pd.notna(peak_time):
                                   time_to_peak = peak_time - start_time
                                   if time_to_peak < 0: time_to_peak = np.nan # Sanity check
                metrics['time_to_peak_brake'] = time_to_peak
            else:
                 metrics['peak_brake_f'] = np.nan
                 metrics['time_to_peak_brake'] = np.nan


        elif segment_type == 'throttle':
            if 'aps' in segment_data.columns:
                # Use smoothed APS to reduce noise when detecting thresholds
                aps_series = pd.to_numeric(segment_data['aps'], errors='coerce')
                aps_sm = aps_series.rolling(window=3, min_periods=1, center=True).mean()
                # Throttle smoothness: Lower standard deviation is smoother
                smoothness_std = aps_series.std()
                metrics['throttle_smoothness_std'] = smoothness_std if pd.notna(smoothness_std) else np.nan

                time_to_full = np.nan  # Time from effective start to aps >= 95%
                if 'elapsed_lap_s' in segment_data.columns and pd.api.types.is_numeric_dtype(segment_data['elapsed_lap_s']):
                    # Determine start event as first time APS crosses 10%, or local minimum near the segment start
                    try:
                        # Prefer first crossing of 10%
                        start_candidates = segment_data[(aps_sm >= 10)].index
                        if len(start_candidates) > 0:
                            start_idx_eff = start_candidates[0]
                        else:
                            # Fallback: local minimum in first 0.5s of the segment
                            start_time_seg = segment_data['elapsed_lap_s'].iloc[0]
                            early_window = segment_data[segment_data['elapsed_lap_s'] <= start_time_seg + 0.5]
                            if not early_window.empty:
                                start_idx_eff = early_window['aps'].idxmin()
                            else:
                                start_idx_eff = segment_data.index[0]

                        full_candidates = segment_data[aps_sm >= 95].index
                        if len(full_candidates) > 0:
                            full_idx = full_candidates[0]
                            start_time_eff = segment_data.loc[start_idx_eff, 'elapsed_lap_s']
                            full_time = segment_data.loc[full_idx, 'elapsed_lap_s']
                            time_to_full = full_time - start_time_eff
                            if time_to_full < 0:
                                time_to_full = np.nan
                            # If ramp time is suspiciously short (< 0.15s), flag as already-full
                            if pd.notna(time_to_full) and time_to_full < 0.15:
                                metrics['already_full_throttle_at_start'] = True
                                time_to_full = np.nan
                            else:
                                metrics['already_full_throttle_at_start'] = False
                            # Optional debug for suspiciously small values
                            if DETAILED_DEBUG and pd.notna(time_to_full) and time_to_full < 0.05:
                                try:
                                    dbg = segment_data[['elapsed_lap_s', 'aps']].head(8)
                                    print("Debug: Very small time_to_full detected (", round(time_to_full, 3),
                                          ") first rows=\n", dbg.to_string(index=False))
                                except Exception:
                                    pass
                    except Exception:
                        pass

                metrics['time_to_full_throttle'] = time_to_full
            else:
                 metrics['throttle_smoothness_std'] = np.nan
                 metrics['time_to_full_throttle'] = np.nan

    except IndexError:
        # Handle cases where iloc[-1] might fail
        # print(f"Warning: IndexError during metric calculation for {segment_type}.")
        pass # Return potentially incomplete metrics dict
    except Exception as e:
        # print(f"Warning: Error calculating metrics for {segment_type}: {e}")
        pass # Return potentially incomplete metrics dict

    # Ensure all expected keys exist, even if NaN
    expected_brake = ['peak_brake_f', 'brake_duration', 'time_to_peak_brake']
    expected_throttle = ['throttle_smoothness_std', 'throttle_duration', 'time_to_full_throttle']

    if segment_type == 'braking':
        for k in expected_brake: metrics.setdefault(k, np.nan)
    elif segment_type == 'throttle':
        for k in expected_throttle: metrics.setdefault(k, np.nan)

    return metrics


def classify_driver_style(brake_metrics, throttle_metrics):
    """
    Classifies driver style based on brake and throttle metrics.
    Returns both the style label and the underlying metrics for detailed feedback.
    """
    style = []
    # Brake style classification
    if pd.notna(brake_metrics.get('time_to_peak_brake')) and pd.notna(brake_metrics.get('peak_brake_f')):
        time_to_peak = brake_metrics['time_to_peak_brake']
        peak_pressure = brake_metrics['peak_brake_f']
        if time_to_peak < 0.25:
            style.append("LATE STOMPER")
        elif time_to_peak < 0.35:
            style.append("BALANCED BRAKER")
        else:
            style.append("SMOOTH ROLLER")
    # Throttle style classification
    if pd.notna(throttle_metrics.get('throttle_smoothness_std')):
        smoothness = throttle_metrics['throttle_smoothness_std']
        if smoothness < 10:
            style.append("PATIENT")
        elif smoothness < 15:
            style.append("PROGRESSIVE")
        else:
            style.append("BUSY/NERVOUS")
    style_label = " / ".join(style) if style else "INSUFFICIENT DATA"
    # Return both label and metrics
    return {
        "style_label": style_label,
        "brake_metrics": brake_metrics,
        "throttle_metrics": throttle_metrics
    }

def calculate_dna_baseline(telemetry_pivot, optimal_laps, vehicle_id):
    """Calculates the average DNA signature and metrics from optimal laps."""
    optimal_brake_curves = []
    optimal_throttle_curves = []
    optimal_brake_metrics = []
    optimal_throttle_metrics = []

    print("\nCalculating DNA Baseline...")
    if not optimal_laps:
         print("  No optimal laps provided.")
         # Return structure with NaNs
         return {
            'brake_signature': np.full(NORMALIZE_POINTS, np.nan),
            'throttle_signature': np.full(NORMALIZE_POINTS, np.nan),
            'brake_metrics': {'peak_brake_f': np.nan, 'brake_duration': np.nan, 'time_to_peak_brake': np.nan},
            'throttle_metrics': {'throttle_smoothness_std': np.nan, 'throttle_duration': np.nan, 'time_to_full_throttle': np.nan}
         }

    for lap_num in optimal_laps:
        # Use cleaned 'lap' column name
        lap_telemetry = telemetry_pivot[(telemetry_pivot['vehicle_id'] == vehicle_id) & (telemetry_pivot['lap'] == lap_num)].copy()
        if lap_telemetry.empty:
            # print(f"  Lap {lap_num}: No telemetry data.")
            continue

        if DETAILED_DEBUG: print(f"\nProcessing Optimal Lap {lap_num}...")

        # --- Braking Segment ---
        b_start, b_end = detect_braking_segment(lap_telemetry)
        if b_start is not None and b_end is not None and b_start <= b_end: # Added check
            brake_segment_data = lap_telemetry.loc[b_start:b_end]
            if not brake_segment_data.empty:
                if DETAILED_DEBUG: print(f"  Lap {lap_num} Braking: Detected segment indices {b_start}-{b_end}")
                norm_brake = normalize_curve(brake_segment_data['pbrake_f'].values)
                if not np.isnan(norm_brake).all(): # Check if normalization worked
                    optimal_brake_curves.append(norm_brake)
                    metrics = calculate_segment_metrics(brake_segment_data, 'braking')
                    if metrics:
                         optimal_brake_metrics.append(metrics)
                         if DETAILED_DEBUG: print(f"  Lap {lap_num} Braking Metrics: { {k: round(v, 3) if isinstance(v, (float, int)) else v for k, v in metrics.items()} }")
                    # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Braking: Metric calculation failed.")
                # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Braking: Normalization failed.")
            # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Braking: Segment empty.")
        # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Braking: Segment not detected.")


        # --- Throttle Segment ---
        t_start, t_end = detect_throttle_segment(lap_telemetry)
        if t_start is not None and t_end is not None and t_start <= t_end: # Added check
             throttle_segment_data = lap_telemetry.loc[t_start:t_end]
             if not throttle_segment_data.empty:
                if DETAILED_DEBUG: print(f"  Lap {lap_num} Throttle: Detected segment indices {t_start}-{t_end}")
                # --- Debug: Print raw throttle data ---
                # if DETAILED_DEBUG: print(f"    Raw APS data: {throttle_segment_data['aps'].values[:10]}...")
                # --- End Debug ---
                norm_throttle = normalize_curve(throttle_segment_data['aps'].values)
                if not np.isnan(norm_throttle).all():
                    optimal_throttle_curves.append(norm_throttle)
                    metrics = calculate_segment_metrics(throttle_segment_data, 'throttle')
                    if metrics:
                         optimal_throttle_metrics.append(metrics)
                         if DETAILED_DEBUG: print(f"  Lap {lap_num} Throttle Metrics: { {k: round(v, 3) if isinstance(v, (float, int)) else v for k, v in metrics.items()} }")
                    # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Throttle: Metric calculation failed.")
                # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Throttle: Normalization failed.")
            # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Throttle: Segment empty.")
        # else: if DETAILED_DEBUG: print(f"  Lap {lap_num} Throttle: Segment not detected.")


    # Average the curves and metrics
    avg_brake_curve = np.nanmean(np.array(optimal_brake_curves), axis=0) if optimal_brake_curves else np.full(NORMALIZE_POINTS, np.nan)
    avg_throttle_curve = np.nanmean(np.array(optimal_throttle_curves), axis=0) if optimal_throttle_curves else np.full(NORMALIZE_POINTS, np.nan)

    # Use pd.DataFrame().mean() which handles NaNs gracefully
    baseline_brake_metrics = pd.DataFrame(optimal_brake_metrics).mean(skipna=True).to_dict() if optimal_brake_metrics else {}
    baseline_throttle_metrics = pd.DataFrame(optimal_throttle_metrics).mean(skipna=True).to_dict() if optimal_throttle_metrics else {}

    # Ensure baseline metrics dicts have expected keys, even if NaN
    expected_brake_keys = ['peak_brake_f', 'brake_duration', 'time_to_peak_brake']
    expected_throttle_keys = ['throttle_smoothness_std', 'throttle_duration', 'time_to_full_throttle']
    for k in expected_brake_keys: baseline_brake_metrics.setdefault(k, np.nan)
    for k in expected_throttle_keys: baseline_throttle_metrics.setdefault(k, np.nan)


    print("\nBaseline DNA Calculated:")
    print(" Avg Brake Signature (first 5 points):", np.round(avg_brake_curve[:5], 3))
    print(" Baseline Brake Metrics:", {k: round(v, 3) if pd.notna(v) and isinstance(v, (float, np.number)) else v for k, v in baseline_brake_metrics.items()})
    print(" Avg Throttle Signature (first 5 points):", np.round(avg_throttle_curve[:5], 3))
    print(" Baseline Throttle Metrics:", {k: round(v, 3) if pd.notna(v) and isinstance(v, (float, np.number)) else v for k, v in baseline_throttle_metrics.items()})

    # --- Verification: Print individual optimal throttle metrics ---
    if DETAILED_DEBUG and optimal_throttle_metrics:
        print("\nIndividual Optimal Throttle Metrics for Verification:")
        for i, metrics in enumerate(optimal_throttle_metrics):
             lap_num = optimal_laps[i] # Assuming order is maintained
             print(f"  Lap {lap_num}: { {k: round(v, 3) if isinstance(v, (float, int)) else v for k, v in metrics.items()} }")
    # --- End Verification ---


    return {
        'brake_signature': avg_brake_curve,
        'throttle_signature': avg_throttle_curve,
        'brake_metrics': baseline_brake_metrics,
        'throttle_metrics': baseline_throttle_metrics
    }


def compare_lap_to_dna(lap_telemetry, dna_baseline):
    """Compares a single lap's segments to the DNA baseline."""
    results = {'brake_comparison': None, 'throttle_comparison': None, 'alerts': []}
    if lap_telemetry.empty: return results

    baseline_b_metrics = dna_baseline.get('brake_metrics', {})
    baseline_t_metrics = dna_baseline.get('throttle_metrics', {})
    baseline_b_curve = dna_baseline.get('brake_signature', np.array([np.nan])) # Use NaN array default
    baseline_t_curve = dna_baseline.get('throttle_signature', np.array([np.nan]))

    # --- Braking Comparison ---
    b_start, b_end = detect_braking_segment(lap_telemetry)
    # Check if baseline signature is valid before proceeding
    if b_start is not None and b_end is not None and b_start <= b_end and not np.isnan(baseline_b_curve).all():
        current_brake_segment = lap_telemetry.loc[b_start:b_end]
        if not current_brake_segment.empty:
            current_norm_brake = normalize_curve(current_brake_segment['pbrake_f'].values)
            current_brake_metrics = calculate_segment_metrics(current_brake_segment, 'braking')

            shape_diff = np.nan
            if not np.isnan(current_norm_brake).all():
                # Ensure shapes match before MSE calculation (should due to normalization)
                if len(current_norm_brake) == len(baseline_b_curve):
                     # Calculate MSE ignoring NaNs in either array
                     mask = ~np.isnan(current_norm_brake) & ~np.isnan(baseline_b_curve)
                     if np.any(mask): # Only calculate if there are overlapping valid points
                          shape_diff = np.mean((current_norm_brake[mask] - baseline_b_curve[mask])**2)
                # else: print("Warning: Normalized brake curve lengths mismatch.")


            # --- Safely calculate deviations ---
            peak_baseline = baseline_b_metrics.get('peak_brake_f', np.nan)
            peak_current = current_brake_metrics.get('peak_brake_f', np.nan)
            peak_dev = (peak_current - peak_baseline) / (peak_baseline or 1) if pd.notna(peak_baseline) and pd.notna(peak_current) and peak_baseline != 0 else np.nan

            duration_baseline = baseline_b_metrics.get('brake_duration', np.nan)
            duration_current = current_brake_metrics.get('brake_duration', np.nan)
            duration_dev = (duration_current - duration_baseline) / (duration_baseline or 1) if pd.notna(duration_baseline) and pd.notna(duration_current) and duration_baseline != 0 else np.nan
            # --- End safe deviation calculation ---

            results['brake_comparison'] = {
                'current_curve': current_norm_brake,
                'metrics': current_brake_metrics,
                'shape_diff_mse': shape_diff,
                'peak_deviation': peak_dev,
                'duration_deviation': duration_dev
            }

            # Generate Alerts (check for NaN deviations)
            if pd.notna(shape_diff) and shape_diff > SHAPE_DIFF_THRESHOLD_MSE:
                results['alerts'].append(f"ALERT: BRAKING shape deviates significantly (MSE={shape_diff:.3f}). Possible inconsistency.")
            if pd.notna(peak_dev) and abs(peak_dev) > PEAK_BRAKE_DEV_THRESHOLD:
                results['alerts'].append(f"ALERT: Peak brake pressure deviation {peak_dev*100:+.1f}%.")
            if pd.notna(duration_dev) and abs(duration_dev) > BRAKE_DURATION_DEV_THRESHOLD:
                 results['alerts'].append(f"ALERT: Brake duration deviation {duration_dev*100:+.1f}%.")
    # else: print("Braking: Baseline invalid or segment not detected in current lap.")


    # --- Throttle Comparison ---
    t_start, t_end = detect_throttle_segment(lap_telemetry)
    if t_start is not None and t_end is not None and t_start <= t_end and not np.isnan(baseline_t_curve).all():
         current_throttle_segment = lap_telemetry.loc[t_start:t_end]
         if not current_throttle_segment.empty:
            current_norm_throttle = normalize_curve(current_throttle_segment['aps'].values)
            current_throttle_metrics = calculate_segment_metrics(current_throttle_segment, 'throttle')

            shape_diff = np.nan
            if not np.isnan(current_norm_throttle).all():
                if len(current_norm_throttle) == len(baseline_t_curve):
                     mask = ~np.isnan(current_norm_throttle) & ~np.isnan(baseline_t_curve)
                     if np.any(mask):
                          shape_diff = np.mean((current_norm_throttle[mask] - baseline_t_curve[mask])**2)
                # else: print("Warning: Normalized throttle curve lengths mismatch.")


            # --- Safely calculate smoothness deviation ---
            smoothness_baseline = baseline_t_metrics.get('throttle_smoothness_std', np.nan)
            smoothness_current = current_throttle_metrics.get('throttle_smoothness_std', np.nan)
            # Use a small epsilon to avoid division by zero if baseline is perfectly smooth (std=0)
            smoothness_dev = (smoothness_current - smoothness_baseline) / (smoothness_baseline if smoothness_baseline > 1e-6 else 1e-6) if pd.notna(smoothness_baseline) and pd.notna(smoothness_current) else np.nan
            # --- End safe deviation calculation ---

            results['throttle_comparison'] = {
                'current_curve': current_norm_throttle,
                'metrics': current_throttle_metrics,
                'shape_diff_mse': shape_diff,
                'smoothness_deviation': smoothness_dev # Higher is worse
            }

            if pd.notna(shape_diff) and shape_diff > SHAPE_DIFF_THRESHOLD_MSE:
                results['alerts'].append(f"ALERT: THROTTLE shape deviates significantly (MSE={shape_diff:.3f}). Check application.")
            if pd.notna(smoothness_dev) and smoothness_dev > THROTTLE_SMOOTHNESS_DEV_THRESHOLD:
                 results['alerts'].append(f"ALERT: Throttle application 'BUSY' (Smoothness deviation {smoothness_dev*100:+.1f}%). Possible over-driving.")
    # else: print("Throttle: Baseline invalid or segment not detected in current lap.")


    return results

# --- Main Execution ---
if __name__ == "__main__":
    warnings.filterwarnings('ignore', category=RuntimeWarning) # Suppress mean of empty slice warnings
    warnings.filterwarnings('ignore', category=FutureWarning) # Suppress potential future pandas warnings

    telemetry_data, lap_times_data, sections_data = load_data()

    if telemetry_data is not None and lap_times_data is not None:
        print("\n=== DRIVER DNA ANALYSIS COMPARISON ===\n")
        
        for driver in TARGET_DRIVERS:
            vehicle_id = driver['id']
            vehicle_number = driver['number']
            
            print(f"\n--- DRIVER #{vehicle_number} ---")

            # Verify target vehicle ID exists
            if vehicle_id not in telemetry_data['vehicle_id'].unique():
                print(f"ERROR: Vehicle ID '{vehicle_id}' not found in telemetry data.")
                continue
            # Verify target vehicle number exists if sections_data loaded
            elif sections_data is not None and 'NUMBER' in sections_data.columns and vehicle_number not in sections_data['NUMBER'].unique():
                print(f"ERROR: Vehicle Number '{vehicle_number}' not found in sections data.")
                continue

            optimal_laps_list = find_optimal_laps(lap_times_data, sections_data, vehicle_id, vehicle_number)

            if optimal_laps_list:
                baseline = calculate_dna_baseline(telemetry_data, optimal_laps_list, vehicle_id)
                
                # Classify driver style
                driver_style = classify_driver_style(baseline['brake_metrics'], baseline['throttle_metrics'])
                print(f"\nDRIVER DNA PROFILE: {driver_style}")
                
                # Print key metrics for comparison
                print("\nKey Metrics:")
                print(f"Avg Peak Brake: {baseline['brake_metrics']['peak_brake_f']:.1f}")
                print(f"Time to Peak Brake: {baseline['brake_metrics']['time_to_peak_brake']:.3f}s")
                print(f"Throttle Smoothness: {baseline['throttle_metrics']['throttle_smoothness_std']:.3f}")
                ttf = baseline['throttle_metrics'].get('time_to_full_throttle', np.nan)
                ttf_str = f"{ttf:.3f}s" if pd.notna(ttf) else "N/A"
                print(f"Time to Full Throttle: {ttf_str}")
                aff = baseline['throttle_metrics'].get('already_full_throttle_at_start', np.nan)
                aff_str = f"{aff*100:.1f}%" if pd.notna(aff) else "N/A"
                print(f"Already Full At Start (share of optimal laps): {aff_str}")
                print("-" * 40)
            else:
                print(f"Could not find enough valid optimal laps for driver {vehicle_id}.")
                print("-" * 40)
