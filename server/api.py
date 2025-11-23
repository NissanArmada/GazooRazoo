from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os
import pandas as pd
import numpy as np
import io
from contextlib import redirect_stdout
import joblib

# Add Module 2 to path so we can import the analysis script
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'Module 2'))
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import driver_dna_analysis as dna
import dynamic_grip_module as grip

app = FastAPI()

# Load Overtake Model
overtake_model_path = os.path.join(os.path.dirname(__file__), '..', 'Overtake Probability Engine', 'overtake_probability_model.joblib')
overtake_model = None
try:
    overtake_model = joblib.load(overtake_model_path)
    print(f"Overtake Model loaded from {overtake_model_path}")
except Exception as e:
    print(f"Failed to load Overtake Model: {e}")

# Enable CORS for React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisRequest(BaseModel):
    telemetryPath: str
    lapsPath: str
    driverId: str
    driverNumber: int

class GripAnalysisRequest(BaseModel):
    weather: dict
    telemetry: dict
    baselineExitSpeed: float = 80.0
    fieldDelta: float = 0.0

class OvertakeRequest(BaseModel):
    gap: float
    time_diff: float
    speed_diff: float

@app.get("/")
def read_root():
    return {"status": "GazooRazoo Analysis API Online"}

@app.post("/analyze-dna")
def analyze_dna(request: AnalysisRequest):
    debug_log = io.StringIO()
    try:
        with redirect_stdout(debug_log):
            print(f"Analyzing DNA for Driver {request.driverNumber} ({request.driverId})...")
            
            # Try to auto-detect sections file if not provided
            sections_path = None
            if request.lapsPath:
                try:
                    base_dir = os.path.dirname(request.lapsPath)
                    for f in os.listdir(base_dir):
                        if "Sections" in f and f.endswith(".CSV"):
                            sections_path = os.path.join(base_dir, f)
                            print(f"Auto-detected sections file: {sections_path}")
                            break
                except Exception as e:
                    print(f"Failed to auto-detect sections file: {e}")

            # Load data using the refactored load_data function
            telemetry_df, lap_times_df, sections_df = dna.load_data(
                telemetry_path=request.telemetryPath,
                lap_times_path=request.lapsPath,
                sections_path=sections_path 
            )
            
            if telemetry_df is None or lap_times_df is None:
                raise HTTPException(status_code=404, detail="Could not load data files")

            # Find optimal laps
            # First, verify if driverId exists in the loaded data
            available_ids = lap_times_df['vehicle_id'].unique()
            target_id = request.driverId
            
            if target_id not in available_ids:
                print(f"Warning: Driver ID '{target_id}' not found in data.")
                # Try to find a matching ID by number suffix
                suffix = f"-{request.driverNumber}"
                matches = [vid for vid in available_ids if str(vid).endswith(suffix)]
                
                if matches:
                    target_id = matches[0]
                    print(f"Found matching ID by suffix: {target_id}")
                else:
                    # Try to find by vehicle_number column if it exists
                    if 'vehicle_number' in lap_times_df.columns:
                        matches = lap_times_df[lap_times_df['vehicle_number'] == request.driverNumber]['vehicle_id'].unique()
                        if len(matches) > 0:
                            target_id = matches[0]
                            print(f"Found matching ID by vehicle_number: {target_id}")

            optimal_laps = dna.find_optimal_laps(
                lap_times_df, 
                sections_df, 
                target_id, 
                request.driverNumber
            )
            
            if not optimal_laps:
                return {
                    "status": "warning",
                    "message": "No valid optimal laps found for driver",
                    "dna": None,
                    "debugLog": debug_log.getvalue()
                }

            # Calculate Baseline DNA
            baseline = dna.calculate_dna_baseline(telemetry_df, optimal_laps, target_id)
            
            # Classify Style
            style = dna.classify_driver_style(baseline['brake_metrics'], baseline['throttle_metrics'])
            
            # Convert numpy types to native Python types for JSON serialization
            def clean_nan(obj):
                if obj is None:
                    return None
                if isinstance(obj, (bool, np.bool_)):
                    return bool(obj)
                if isinstance(obj, (int, np.integer)):
                    return int(obj)
                if isinstance(obj, (float, np.floating)):
                    if np.isnan(obj) or np.isinf(obj):
                        return None
                    return float(obj)
                if isinstance(obj, (str, bytes)):
                    return obj
                if isinstance(obj, dict):
                    return {k: clean_nan(v) for k, v in obj.items()}
                if isinstance(obj, (list, tuple, np.ndarray, pd.Series)):
                    return [clean_nan(x) for x in obj]
                if isinstance(obj, pd.DataFrame):
                    return clean_nan(obj.to_dict(orient='records'))
                return obj

            response_data = {
                "status": "success",
                "driverId": target_id,
                "optimalLaps": optimal_laps,
                "style": style,
                "dna": baseline,
                "debugLog": debug_log.getvalue()
            }
            
            return clean_nan(response_data)

    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"{str(e)} | Log: {debug_log.getvalue()}")

@app.post("/analyze-grip")
def analyze_grip(request: GripAnalysisRequest):
    try:
        # Ensure the residual model is loaded if available
        # We can try to load it once or every time. The module has a load function.
        # For simplicity, we'll let the module handle it or pass None if we don't want to manage state here.
        # However, the module's infer_grip takes an optional residual_rf.
        # Let's try to load it.
        rf_model, _ = grip.load_residual_model()
        
        result = grip.infer_grip(
            request.weather,
            request.telemetry,
            baseline_exit_speed=request.baselineExitSpeed,
            field_sector_mean_delta=request.fieldDelta,
            residual_rf=rf_model
        )
        return {"status": "success", "data": result}
    except Exception as e:
        print(f"Grip Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict-overtake")
def predict_overtake(request: OvertakeRequest):
    if not overtake_model:
        raise HTTPException(status_code=503, detail="Overtake model not loaded")
    
    try:
        # Calculate DRS (Feature Engineering)
        drs_available = 1 if request.gap <= 1.0 else 0
        
        # Create DataFrame with exact column names expected by the model
        input_df = pd.DataFrame({
            'Gap_At_P1': [request.gap],
            'T11_Time_Diff': [request.time_diff],
            'Exit_Speed_Diff': [request.speed_diff],
            'DRS_Available': [drs_available]
        })
        
        # Predict
        # predict_proba returns [[prob_fail, prob_pass]]
        probability = overtake_model.predict_proba(input_df)[0][1]
        
        return {
            "status": "success",
            "probability": round(probability * 100, 1),
            "drs": bool(drs_available)
        }
    except Exception as e:
        print(f"Overtake Prediction Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
