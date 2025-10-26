import pandas as pd
import numpy as np

print("--- Calculating 'Successful_Pass' ---")

# --- Helper function for time conversion ---
def time_str_to_seconds(time_str):
    if pd.isna(time_str):
        return None
    # Handle potential float inputs directly
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
        else:
             return None # Invalid format
        return seconds
    except Exception:
        return None # Handle parsing errors


try:
    # --- 1. Load Data ---
    df_analysis = pd.read_csv("23_AnalysisEnduranceWithSections_Race 1_Anonymized.CSV", delimiter=';')
    df_analysis.columns = df_analysis.columns.str.strip()

    # Define timing points based on assumptions
    point1_col = 'IM2_elapsed' # T11 Exit
    point2_col = 'IM3a_elapsed' # T12 Entry (Before braking for T12)

    # --- 2. Convert Elapsed Times ---
    df_analysis[f'{point1_col}_s'] = df_analysis[point1_col].apply(time_str_to_seconds)
    df_analysis[f'{point2_col}_s'] = df_analysis[point2_col].apply(time_str_to_seconds)

    # Keep only necessary columns for calculation
    df_passes = df_analysis[['NUMBER', 'LAP_NUMBER', f'{point1_col}_s', f'{point2_col}_s']].copy()
    df_passes = df_passes.dropna(subset=[f'{point1_col}_s', f'{point2_col}_s']) # Drop rows missing critical data

    # --- 3. Sort by Lap and Position (Time) ---
    # Sort by lap, then by elapsed time at Point 1 (T11 exit)
    df_passes = df_passes.sort_values(by=['LAP_NUMBER', f'{point1_col}_s'])

    # --- 4. Calculate Gaps at Point 1 and Point 2 ---
    grouped = df_passes.groupby('LAP_NUMBER')

    # Gap at T11 Exit (Point 1)
    df_passes['Prev_Elapsed_P1'] = grouped[f'{point1_col}_s'].shift(1)
    df_passes['Gap_At_P1'] = df_passes[f'{point1_col}_s'] - df_passes['Prev_Elapsed_P1']
    df_passes['Car_Ahead_P1'] = grouped['NUMBER'].shift(1) # Keep track of who was ahead

    # Gap at T12 Entry (Point 2) - Need to sort by Point 2 time *within the lap* temporarily
    df_passes = df_passes.sort_values(by=['LAP_NUMBER', f'{point2_col}_s'])
    grouped_p2 = df_passes.groupby('LAP_NUMBER') # Re-group after sorting by P2
    df_passes['Prev_Elapsed_P2'] = grouped_p2[f'{point2_col}_s'].shift(1)
    df_passes['Gap_At_P2'] = df_passes[f'{point2_col}_s'] - df_passes['Prev_Elapsed_P2']
    df_passes['Car_Ahead_P2'] = grouped_p2['NUMBER'].shift(1)

    # --- 5. Determine Opportunities and Success ---
    # Restore original sorting by Point 1
    df_passes = df_passes.sort_values(by=['LAP_NUMBER', f'{point1_col}_s'])

    opportunity_threshold = 1.5 # seconds

    # An opportunity exists if the gap at P1 was positive and below the threshold
    df_passes['Overtake_Opportunity'] = (df_passes['Gap_At_P1'] > 0) & (df_passes['Gap_At_P1'] <= opportunity_threshold)

    # A successful pass requires:
    # 1. An opportunity existed at P1.
    # 2. The car number that *was* ahead at P1 is the *same* car number that is now behind at P2.
    #    (This handles multi-car overtakes/position swaps correctly).
    df_passes['Successful_Pass'] = np.where(
        (df_passes['Overtake_Opportunity']) & (df_passes['Car_Ahead_P1'] == df_passes['NUMBER'].shift(-1)), # Check if the car initially ahead is now behind
        1,
        0
    )
    # Refinement: We need a slightly different logic for checking success.
    # Let's re-calculate Gap_At_P2 based on the *original* car order from P1.
    # Merge P2 times back based on original order.
    df_p2_times = df_passes[['LAP_NUMBER', 'NUMBER', f'{point2_col}_s']].copy()
    df_passes = pd.merge(df_passes, df_p2_times.rename(columns={'NUMBER':'Car_Ahead_P1', f'{point2_col}_s':'Car_Ahead_P2_s'}),
                         on=['LAP_NUMBER', 'Car_Ahead_P1'], how='left')

    # If this car's P2 time is LESS than the P2 time of the car that was ahead at P1, it's a pass.
    df_passes['Successful_Pass'] = np.where(
        (df_passes['Overtake_Opportunity']) & (df_passes[f'{point2_col}_s'] < df_passes['Car_Ahead_P2_s']),
        1,
        0
    )


    # Clean up intermediate columns
    df_final_passes = df_passes[['NUMBER', 'LAP_NUMBER', 'Gap_At_P1', 'Gap_At_P2', 'Overtake_Opportunity', 'Successful_Pass']].copy()
    # Replace infinite values resulting from subtractions involving NaN with actual NaN
    df_final_passes.replace([np.inf, -np.inf], np.nan, inplace=True)


    print("'Successful_Pass' calculated.")
    print("\n--- Overtake Opportunities and Outcomes ---")
    # Show only the opportunities found
    print(df_final_passes[df_final_passes['Overtake_Opportunity'] == True].round(3))

    # Save to CSV for inspection
    df_final_passes.to_csv("overtake_analysis.csv", index=False)
    print("\nFull results saved to 'overtake_analysis.csv'")


except KeyError as e:
    print(f"Error: A required column is missing: {e}. Please check column names and assumptions.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")
