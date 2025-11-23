import pandas as pd
import os
import json

# --- METRIC CONFIGURATION ---
# These are the *exact* names from the 'telemetry_name' column.
METRICS_TO_KEEP = [
    'gear',                     # Correct!
    'speed',                    # Correct!
    'nmot',                     # Correct! (This is your RPM)
]
# --- END METRIC CONFIGURATION ---


def process_race_files(telemetry_file_name, best_laps_file_name, section_analysis_file_name, race_prefix, race_folder_path, manifest_data, track, r):
    """
    Processes a single race: loads files, gets all drivers, 
    then filters, pivots, and saves a unique CSV for each driver
    into a 'driver_insights' subfolder.
    Updates the manifest_data dictionary.
    """
    print(f"\n=============================================")
    print(f"Processing Race: {race_prefix}")
    print(f"  Source Folder: {race_folder_path}")
    print(f"=============================================")

    # --- File Existence Check ---
    if not os.path.exists(telemetry_file_name):
        print(f"[Warning] Telemetry file not found: {telemetry_file_name}. Skipping race '{race_prefix}'.")
        return 0
    if not os.path.exists(best_laps_file_name):
        print(f"[Warning] Best Laps file not found: {best_laps_file_name}. Skipping race '{race_prefix}'.")
        return 0
    if not os.path.exists(section_analysis_file_name):
        print(f"[Warning] Section Analysis file not found: {section_analysis_file_name}. Time Loss feature will be disabled for this race.")
        section_analysis_file_name = None # Set to None if not found

    # --- Step 1: Get List of All Drivers for this race ---
    print(f"Loading '{best_laps_file_name}' to find all drivers...")
    try:
        best_laps_df = pd.read_csv(best_laps_file_name, delimiter=';', skipinitialspace=True)
        all_drivers = best_laps_df['NUMBER'].astype(str).unique()
        if len(all_drivers) == 0:
            print(f"Error: No drivers found in 'NUMBER' column of {best_laps_file_name}.")
            return 0
        print(f"Found {len(all_drivers)} drivers to process for this race: {all_drivers}")
    except Exception as e:
        print(f"Error reading Best Laps CSV '{best_laps_file_name}': {e}")
        return 0

    # --- Step 2: Initialize Manifest Entry for this Race ---
    if track not in manifest_data:
        manifest_data[track] = {}
    if r not in manifest_data[track]:
        manifest_data[track][r] = {
            "best_laps_file": os.path.relpath(best_laps_file_name, ROOT_DIR).replace("\\", "/"),
            "section_analysis_file": os.path.relpath(section_analysis_file_name, ROOT_DIR).replace("\\", "/") if section_analysis_file_name else None,
            "drivers": {}
        }

    # --- Step 3: Load Full Telemetry Data (Once per race) ---
    print(f"Loading '{telemetry_file_name}'... This may take a few minutes.")
    try:
        # NOTE: User confirmed the raw telemetry file uses a ',' delimiter.
        df = pd.read_csv(telemetry_file_name, delimiter=',', skipinitialspace=True) # <-- FIXED: Changed from ';' back to ','
        
        # --- NEW FIX: Robust column name cleaning ---
        df.columns = df.columns.str.strip().str.strip('"').str.strip("'")
        print(f"Cleaned column names. Found columns: {list(df.columns)}")
        # --- END NEW FIX ---
        
    except Exception as e:
        print(f"Error reading Telemetry CSV '{telemetry_file_name}': {e}")
        return 0

    print(f"Full dataset loaded. Rows: {len(df)}")

    # Normalize vehicle_number column
    try:
        # --- NEW FIX: Add a guard check ---
        if 'vehicle_number' not in df.columns:
            raise KeyError("Column 'vehicle_number' not found after auto-cleaning.")
        # --- END NEW FIX ---
            
        df['vehicle_number_clean'] = df['vehicle_number'].astype(str).str.replace(r'\.0$', '', regex=True)
        print("Normalized 'vehicle_number' column for matching.")
    except Exception as e:
        # --- NEW FIX: Safer error handling ---
        print(f"\n--- FATAL ERROR ---") # <-- FIXED: Removed {driver_number}
        print(f"Could not access 'vehicle_number' column: {e}")
        print("Please check the column name in your raw telemetry CSV file.")
        print(f"Columns found in file: {list(df.columns)}")
        print(f"Skipping this race '{race_prefix}'.")
        return 0 # Stop processing this race
        # --- END NEW FIX ---

    print("Filtering data for *all* target metrics at once...")
    df_metrics_filtered = df[df['telemetry_name'].isin(METRICS_TO_KEEP)]

    if df_metrics_filtered.empty:
        print(f"Error: No data found for any of the metrics: {METRICS_TO_KEEP}")
        return 0

    print(f"Total relevant metric rows: {len(df_metrics_filtered)}")

    # --- Step 4: Create Output Directory ---
    output_dir = os.path.join(race_folder_path, "driver_insights")
    try:
        os.makedirs(output_dir, exist_ok=True)
        print(f"Ensured output directory exists: {output_dir}")
    except Exception as e:
        print(f"Error creating output directory '{output_dir}': {e}. Skipping race.")
        return 0

    # --- Step 5: Loop, Filter, Pivot, and Save for Each Driver ---
    processed_count = 0
    for driver_number in all_drivers:
        print(f"\n--- Processing Driver: {driver_number} ---")
        
        print(f"Filtering for Driver '{driver_number}'...")
        df_driver_filtered = df_metrics_filtered[
            (df_metrics_filtered['vehicle_number_clean'] == driver_number)
        ]

        if df_driver_filtered.empty:
            print(f"Warning: No telemetry data found for driver {driver_number}. Skipping.")
            continue

        print(f"Found {len(df_driver_filtered)} relevant rows for driver {driver_number}.")

        print("Pivoting data from 'long' to 'wide' format...")
        try:
            df_pivoted = df_driver_filtered.pivot_table(
                index=['timestamp', 'lap', 'vehicle_number'],
                columns='telemetry_name',
                values='telemetry_value'
            ).reset_index()
            df_pivoted.columns.name = None
            df_pivoted = df_pivoted.infer_objects()
        except Exception as e:
            print(f"Error pivoting data for driver {driver_number}: {e}")
            continue
            
        print("Data successfully pivoted.")

        print("Forward-filling asynchronous data gaps...")
        pivoted_metrics = [col for col in METRICS_TO_KEEP if col in df_pivoted.columns]
        
        if not pivoted_metrics:
            print(f"Warning: None of the METRICS_TO_KEEP found for driver {driver_number}.")
            continue
            
        df_pivoted[pivoted_metrics] = df_pivoted[pivoted_metrics].ffill().fillna(0)
        print("Data gaps filled.")

        # --- NEW: Convert data types before saving ---
        try:
            if 'gear' in df_pivoted.columns:
                df_pivoted['gear'] = df_pivoted['gear'].astype(int)
            if 'lap' in df_pivoted.columns:
                df_pivoted['lap'] = df_pivoted['lap'].astype(int)
            print("Converted 'gear' and 'lap' columns to integer type.")
        except Exception as e:
            print(f"Warning: Could not convert columns to int: {e}")
        # --- END NEW ---

        # Save the New File
        output_filename = f'{race_prefix}_driver_{driver_number}_telemetry_pivoted.csv'
        output_path = os.path.join(output_dir, output_filename)
        
        print(f"Saving new file to: '{output_path}'")
        df_pivoted.to_csv(output_path, index=False)
        
        # --- Add to Manifest ---
        manifest_data[track][r]["drivers"][driver_number] = os.path.relpath(output_path, ROOT_DIR).replace("\\", "/")
        # --- End Add to Manifest ---
        
        processed_count += 1
    
    return processed_count

# --- Main Execution ---
if __name__ == "__main__":
    print("--- Starting Batch Telemetry Processing & Manifest Generation ---")
    
    # --- CONFIGURATION: SET YOUR FILE STRUCTURE ---
    ROOT_DIR = os.getcwd()
    tracks_name = ['barber', 'cota', 'indianapolis', 'road_america', 'sebring', 'sonoma', 'vir']
    races = ['Race 1', 'Race 2']
    # --- END CONFIGURATION ---

    # This dictionary will hold all paths for the manifest
    manifest_data = {}
    total_files_created = 0
    
    if not tracks_name:
        print("No tracks defined in 'tracks_name' list. Exiting.")
    
    # Loop through the directory structure
    for track in tracks_name:
        for r in races:
            race_number = r[-1] # Gets '1' or '2'
            race_folder_path = os.path.join(ROOT_DIR, track, r)
            
            # 1. Telemetry File Path
            telemetry_file_path = os.path.join(race_folder_path, f'R{race_number}_{track}_telemetry_data.csv')
            
            # 2. Best Laps File Path
            best_laps_file_path = os.path.join(race_folder_path, f'99_Best 10 Laps By Driver_{r}_Anonymized.CSV')
            
            # 3. Section Analysis File Path (for Time Loss upgrade)
            #    e.g., 23_AnalysisEnduranceWithSections_Race_1_anonymized.CSV
            section_analysis_file_path = os.path.join(race_folder_path, f'23_AnalysisEnduranceWithSections_{r}_anonymized.CSV')

            race_prefix = f"{track}_r{race_number}"

            # Check if main telemetry file exists *before* calling
            if not os.path.exists(telemetry_file_path):
                print(f"Skipping: Main telemetry file not found at {telemetry_file_path}")
                continue

            # Call the processing function
            count = process_race_files(
                telemetry_file_name=telemetry_file_path,
                best_laps_file_name=best_laps_file_path,
                section_analysis_file_name=section_analysis_file_path,
                race_prefix=race_prefix,
                race_folder_path=race_folder_path,
                manifest_data=manifest_data,
                track=track,
                r=r
            )
            if count > 0:
                print(f"--- Finished Race: {race_prefix}. Created {count} driver files. ---")
            total_files_created += count

    # --- Step 6: Write the Manifest File ---
    manifest_path = os.path.join(ROOT_DIR, 'manifest.json')
    try:
        with open(manifest_path, 'w') as f:
            json.dump(manifest_data, f, indent=4)
        print(f"\n--- SUCCESS! ---")
        print(f"Batch Processing Complete. Total files created: {total_files_created}")
        print(f"Data manifest file created at: {manifest_path}")
    except Exception as e:
        print(f"\n--- ERROR ---")
        print(f"Error writing manifest.json file: {e}")