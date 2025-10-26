import pandas as pd
import io
import numpy as np

# --- Helper function for time conversion ---
def time_str_to_seconds(time_str):
    if pd.isna(time_str):
        return None
    if isinstance(time_str, (int, float)):
        return float(time_str)
    try:
        parts = str(time_str).split(':')
        seconds = 0
        if len(parts) == 3: # HH:MM:SS.fff
            seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2: # MM:SS.fff
             seconds = int(parts[0]) * 60 + float(parts[1])
        elif len(parts) == 1: # SS.fff or just S
             seconds = float(parts[0])
        else: return None
        return seconds
    except Exception: return None

# --- 1. Load Analysis Data & Calculate T11 Time ---
print("--- 1. Loading Analysis Data & T11 Time ---")
try:
    df_analysis = pd.read_csv("23_AnalysisEnduranceWithSections_Race 1_Anonymized.CSV", delimiter=';')
    df_analysis.columns = df_analysis.columns.str.strip()
    # Define T11 points and calculate time
    t11_start_col = 'IM2a_elapsed'
    t11_end_col = 'IM2_elapsed'
    t11_start_time_col = 'IM2a_time'
    t11_end_time_col = 'IM2_time'

    # Convert intermediate times to seconds before subtraction
    df_analysis['t11_start_s'] = df_analysis[t11_start_time_col].apply(time_str_to_seconds)
    df_analysis['t11_end_s'] = df_analysis[t11_end_time_col].apply(time_str_to_seconds)

    # Assuming *_time columns are point-in-time, calculate duration
    df_analysis['T11_Time'] = df_analysis['t11_end_s'] - df_analysis['t11_start_s']
    # If the time columns *already* represent duration, use:
    # df_analysis['T11_Time'] = df_analysis['t11_start_s'] + df_analysis['t11_end_s'] # Check which is correct

    # Convert T11 exit elapsed time to seconds
    df_analysis[f'{t11_end_col}_s'] = df_analysis[t11_end_col].apply(time_str_to_seconds)

    print("Analysis data loaded, T11 times calculated.")
except Exception as e:
    print(f"Error in Step 1: {e}")
    df_analysis = pd.DataFrame() # Ensure df exists

# --- 2. Load Lap Start Times ---
print("\n--- 2. Loading Lap Start Times ---")
try:
    df_lap_start = pd.read_csv("vir_lap_start_R1.csv")
    df_lap_start['lap_start_time'] = pd.to_datetime(df_lap_start['value'], errors='coerce')
    df_lap_start = df_lap_start.dropna(subset=['lap_start_time'])
    # Extract vehicle number assuming format like 'GR86-XXX-Num' or similar
    # This part is crucial and might need adjustment based on the actual vehicle_id format
    try:
         # Attempt to extract number if format is consistent (e.g., GR86-002-2 -> 2)
         df_lap_start['NUMBER'] = df_lap_start['vehicle_id'].str.split('-').str[-1].astype(int)
    except:
         # Fallback if extraction fails - create dummy numbers for demo
         print("Warning: Could not reliably extract NUMBER from vehicle_id. Using vehicle_id for join key.")
         df_lap_start['NUMBER'] = df_lap_start['vehicle_id'] # Less ideal, join might fail

    df_lap_start = df_lap_start[['NUMBER', 'lap', 'lap_start_time']].rename(columns={'lap': 'LAP_NUMBER'})
    print("Lap start times loaded.")
except Exception as e:
    print(f"Error in Step 2: {e}")
    df_lap_start = pd.DataFrame()

# --- 3. Merge Lap Start Times & Calculate Exit Timestamps ---
print("\n--- 3. Merging Lap Start & Calculating Exit Timestamps ---")
if not df_analysis.empty and not df_lap_start.empty:
    df_analysis = pd.merge(df_analysis, df_lap_start,
                           on=['NUMBER', 'LAP_NUMBER'], how='left')
    df_analysis[f'{t11_end_col}_td'] = pd.to_timedelta(df_analysis[f'{t11_end_col}_s'], unit='s', errors='coerce')
    df_analysis['T11_Exit_Timestamp'] = df_analysis['lap_start_time'] + df_analysis[f'{t11_end_col}_td']
    df_analysis = df_analysis.dropna(subset=['T11_Exit_Timestamp']) # Remove rows where calculation failed
    print("Merged lap starts, calculated T11 exit timestamps.")
else:
    print("Skipping Step 3 due to missing dataframes.")
    if 'T11_Exit_Timestamp' not in df_analysis: df_analysis['T11_Exit_Timestamp'] = pd.NaT

# --- 4. Load and Process Telemetry ---
print("\n--- 4. Loading and Processing Telemetry ---")
# Using the previously provided sample string
telemetry_data_string = """expire_at,lap,meta_event,meta_session,meta_source,meta_time,original_vehicle_id,outing,telemetry_name,telemetry_value,timestamp,vehicle_id,vehicle_number
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,accx_can,0.217,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,accy_can,-0.19,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,ath,100.02,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,pbrake_r,0,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,pbrake_f,0,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,gear,3,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,Steering_Angle,-4.2,2025-07-17T19:16:54.077Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,accx_can,0.189,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,accy_can,-0.211,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,ath,100.02,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,pbrake_r,0,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,pbrake_f,0,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,gear,3,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,Steering_Angle,-4.7,2025-07-17T19:16:54.034Z,GR86-002-2,2
,1,I_R04_2025-07-20,R1,kafka:gr-raw,2025-07-19T18:06:40.175Z,GR86-002-2,0,speed,135.41,2025-07-17T19:16:53.946Z,GR86-002-2,2
# Add more sample data here if available, especially ensuring 'speed' entries exist for different cars/laps
"""
try:
    telemetry_io = io.StringIO(telemetry_data_string)
    df_telemetry_long = pd.read_csv(telemetry_io)
    df_telemetry_long['timestamp'] = pd.to_datetime(df_telemetry_long['timestamp'], errors='coerce')
    df_telemetry_long = df_telemetry_long.dropna(subset=['timestamp'])
    df_telemetry = df_telemetry_long.pivot_table(
        index=['vehicle_number', 'lap', 'timestamp'], # Use vehicle_number
        columns='telemetry_name', values='telemetry_value', aggfunc='first' # Use aggfunc='first' to handle potential duplicates
    ).reset_index()
    numeric_cols = ['speed', 'ath', 'pbrake_f', 'pbrake_r', 'gear', 'Steering_Angle', 'nmot', 'accx_can', 'accy_can']
    for col in numeric_cols:
        if col in df_telemetry.columns:
            df_telemetry[col] = pd.to_numeric(df_telemetry[col], errors='coerce')
    df_telemetry = df_telemetry.rename(columns={'vehicle_number': 'NUMBER', 'lap': 'LAP_NUMBER'}) # Rename for merging
    df_telemetry = df_telemetry.sort_values(by=['NUMBER', 'LAP_NUMBER', 'timestamp'])
    print("Telemetry data loaded and processed.")
except Exception as e:
    print(f"Error processing telemetry data: {e}")
    df_telemetry = pd.DataFrame()

# --- 5. Calculate Exit Speed ---
print("\n--- 5. Calculating T11 Exit Speed ---")
if not df_analysis.empty and not df_telemetry.empty and 'T11_Exit_Timestamp' in df_analysis.columns:
    # Function to find the closest speed reading
    def find_closest_speed(row, telemetry_df):
        if pd.isna(row['T11_Exit_Timestamp']) or pd.isna(row['NUMBER']) or pd.isna(row['LAP_NUMBER']):
            return np.nan
        # Ensure types match for filtering
        num = int(row['NUMBER'])
        lap = int(row['LAP_NUMBER'])
        ts = row['T11_Exit_Timestamp']

        tel_subset = telemetry_df[(telemetry_df['NUMBER'] == num) & (telemetry_df['LAP_NUMBER'] == lap)].copy() # Ensure NUMBER and LAP_NUMBER match types
        if tel_subset.empty or 'speed' not in tel_subset.columns or tel_subset['speed'].isnull().all():
            return np.nan # No data or no speed data for this car/lap

        # Calculate time difference and find the minimum absolute difference
        tel_subset['time_diff'] = (tel_subset['timestamp'] - ts).abs()
        closest_row = tel_subset.loc[tel_subset['time_diff'].idxmin()]

        # Optional: Check if the closest timestamp is within a reasonable tolerance (e.g., 0.5 seconds)
        # if closest_row['time_diff'] > pd.Timedelta(seconds=0.5):
        #     return np.nan # Too far away in time

        return closest_row['speed']

    # Apply the function (Ensure NUMBER/LAP_NUMBER types are consistent)
    df_analysis['NUMBER'] = df_analysis['NUMBER'].astype(int)
    df_analysis['LAP_NUMBER'] = df_analysis['LAP_NUMBER'].astype(int)
    df_telemetry['NUMBER'] = df_telemetry['NUMBER'].astype(int)
    df_telemetry['LAP_NUMBER'] = df_telemetry['LAP_NUMBER'].astype(int)

    df_analysis['T11_Exit_Speed'] = df_analysis.apply(find_closest_speed, telemetry_df=df_telemetry, axis=1)
    print("T11 exit speeds calculated (based on closest timestamp).")
else:
    print("Skipping exit speed calculation due to missing data.")
    if 'T11_Exit_Speed' not in df_analysis: df_analysis['T11_Exit_Speed'] = np.nan

# --- 6. Calculate Pass Success ---
print("\n--- 6. Calculating Pass Success ---")
try:
    # Reload analysis data if needed (or use df_analysis from step 1)
    df_passes_calc = df_analysis[['NUMBER', 'LAP_NUMBER', 'IM2_elapsed', 'IM3a_elapsed']].copy() # Use original elapsed strings

    # Convert times to seconds robustly
    df_passes_calc['P1_s'] = df_passes_calc['IM2_elapsed'].apply(time_str_to_seconds)
    df_passes_calc['P2_s'] = df_passes_calc['IM3a_elapsed'].apply(time_str_to_seconds)
    df_passes_calc = df_passes_calc.dropna(subset=['P1_s', 'P2_s'])

    # Sort by P1 time
    df_passes_calc = df_passes_calc.sort_values(by=['LAP_NUMBER', 'P1_s'])
    grouped = df_passes_calc.groupby('LAP_NUMBER')

    # Get Gap and Car Ahead at P1
    df_passes_calc['Gap_At_P1'] = df_passes_calc['P1_s'] - grouped['P1_s'].shift(1)
    df_passes_calc['Car_Ahead_P1_Num'] = grouped['NUMBER'].shift(1)

    # Merge P2 times based on the P1 order to compare correctly
    df_p2_times = df_passes_calc[['LAP_NUMBER', 'NUMBER', 'P2_s']].copy()
    df_passes_calc = pd.merge(df_passes_calc, df_p2_times.rename(columns={'NUMBER':'Car_Ahead_P1_Num', 'P2_s':'Car_Ahead_P2_s'}),
                              on=['LAP_NUMBER', 'Car_Ahead_P1_Num'], how='left')

    opportunity_threshold = 1.5
    df_passes_calc['Overtake_Opportunity'] = (df_passes_calc['Gap_At_P1'] > 0) & (df_passes_calc['Gap_At_P1'] <= opportunity_threshold)

    # Success if opportunity existed AND this car's P2 time < car ahead's P2 time
    df_passes_calc['Successful_Pass'] = np.where(
        (df_passes_calc['Overtake_Opportunity']) & (df_passes_calc['P2_s'] < df_passes_calc['Car_Ahead_P2_s']),
        1, 0
    )

    df_final_passes = df_passes_calc[['NUMBER', 'LAP_NUMBER', 'Car_Ahead_P1_Num', 'Gap_At_P1', 'Overtake_Opportunity', 'Successful_Pass']].copy()
    print("Pass success calculated.")

except KeyError as e:
    print(f"Error in Step 6 (KeyError): {e}. Check column names.")
    df_final_passes = pd.DataFrame()
except Exception as e:
    print(f"Error in Step 6: {e}")
    df_final_passes = pd.DataFrame()


# --- 7. Merge All Data for Training Set ---
print("\n--- 7. Merging Data for Training Set ---")
if not df_analysis.empty and not df_final_passes.empty:
    # Select features from df_analysis
    df_features = df_analysis[['NUMBER', 'LAP_NUMBER', 'T11_Time', 'T11_Exit_Speed']].copy()

    # Merge pass outcomes with features
    df_merged = pd.merge(df_final_passes, df_features, on=['NUMBER', 'LAP_NUMBER'], how='left')

    # Filter only the overtake opportunities
    df_opportunities = df_merged[df_merged['Overtake_Opportunity'] == True].copy()

    # Get features for the car ahead (Car B)
    # Rename columns for Car A (the overtaking car)
    df_opportunities = df_opportunities.rename(columns={
        'NUMBER': 'Car_A_Num',
        'T11_Time': 'Car_A_T11_Time',
        'T11_Exit_Speed': 'Car_A_Exit_Speed'
    })

    # Prepare features of Car B (the car being overtaken)
    df_car_b_features = df_features.rename(columns={
        'NUMBER': 'Car_Ahead_P1_Num', # Use this as the key to merge
        'LAP_NUMBER': 'LAP_NUMBER',
        'T11_Time': 'Car_B_T11_Time',
        'T11_Exit_Speed': 'Car_B_Exit_Speed'
    })

    # Merge Car B's features into the opportunities dataframe
    df_train_raw = pd.merge(df_opportunities, df_car_b_features,
                        on=['Car_Ahead_P1_Num', 'LAP_NUMBER'], how='left')

    # Select and arrange the final columns for the training set
    final_cols = [
        'LAP_NUMBER',
        'Car_A_Num',
        'Car_Ahead_P1_Num', # Renaming Car_B_Num for clarity
        'Gap_At_P1',
        'Car_A_T11_Time',
        'Car_B_T11_Time',
        'Car_A_Exit_Speed',
        'Car_B_Exit_Speed',
        'Successful_Pass' # This is our target variable 'y'
    ]

    # Add calculated difference columns (often useful features)
    if 'Car_A_T11_Time' in df_train_raw.columns and 'Car_B_T11_Time' in df_train_raw.columns:
        df_train_raw['T11_Time_Diff'] = df_train_raw['Car_A_T11_Time'] - df_train_raw['Car_B_T11_Time'] # Negative means Car A is faster
        final_cols.insert(6, 'T11_Time_Diff') # Insert after individual times

    if 'Car_A_Exit_Speed' in df_train_raw.columns and 'Car_B_Exit_Speed' in df_train_raw.columns:
        df_train_raw['Exit_Speed_Diff'] = df_train_raw['Car_A_Exit_Speed'] - df_train_raw['Car_B_Exit_Speed'] # Positive means Car A is faster
        final_cols.insert(9, 'Exit_Speed_Diff') # Insert after individual speeds


    # Ensure all required columns exist before selecting
    final_cols_exist = [col for col in final_cols if col in df_train_raw.columns]
    df_train = df_train_raw[final_cols_exist].copy()

    # Drop rows with missing values in key feature columns (essential for training)
    key_features_for_na_check = ['Gap_At_P1', 'Car_A_T11_Time', 'Car_B_T11_Time', 'Car_A_Exit_Speed', 'Car_B_Exit_Speed', 'Successful_Pass']
    missing_key_cols = [col for col in key_features_for_na_check if col not in df_train.columns]
    if missing_key_cols:
        print(f"Warning: Missing key columns for NA check: {missing_key_cols}")
    else:
        df_train = df_train.dropna(subset=key_features_for_na_check)

    print("\n--- Final Training Dataset Ready ---")
    print(f"Number of Overtake Opportunities Found: {len(df_opportunities)}")
    print(f"Number of Samples for Training (after dropping NaNs): {len(df_train)}")
    print(df_train.head())

    # Save the training data
    df_train.to_csv("training_data.csv", index=False)
    print("\nTraining data saved to 'training_data.csv'")

else:
    print("Could not create training set due to missing intermediate dataframes.")
