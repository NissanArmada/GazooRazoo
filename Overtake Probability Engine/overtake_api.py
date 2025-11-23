from flask import Flask, request, jsonify
from flask_cors import CORS # Helps with browser permissions
import joblib
import pandas as pd
import numpy as np

app = Flask(__name__)
CORS(app) # Allows your dashboard to talk to this API

# --- 1. Load the "Brain" ---
print("Loading Overtake Engine...")
try:
    model = joblib.load('overtake_probability_model.joblib')
    print("Engine Loaded! Ready for live data.")
except Exception as e:
    print(f"Error loading model: {e}")
    exit()

@app.route('/predict', methods=['POST'])
def predict():
    """
    This function runs whenever your dashboard sends data to 
    http://localhost:5000/predict
    """
    try:
        # 1. Get the data sent by the dashboard
        data = request.json
        
        # We expect the dashboard to send these raw numbers:
        gap = float(data['gap'])
        time_diff = float(data['time_diff'])   # (My Time - Target Time)
        speed_diff = float(data['speed_diff']) # (My Speed - Target Speed)

        # 2. Calculate the 'Hidden' Feature (DRS)
        # We must do exactly what we did in training!
        drs_available = 1 if gap <= 1.0 else 0

        # 3. Package it for the model
        # The column names MUST match training_data.csv exactly
        input_df = pd.DataFrame({
            'Gap_At_P1': [gap],
            'T11_Time_Diff': [time_diff],
            'Exit_Speed_Diff': [speed_diff],
            'DRS_Available': [drs_available]
        })

        # 4. Ask the model for the probability
        # predict_proba returns [[prob_fail, prob_pass]]
        probability = model.predict_proba(input_df)[0][1]

        # 5. Send the answer back to the dashboard
        return jsonify({
            'success': True,
            'overtake_probability': round(probability * 100, 1), # Return percentage
            'message': "Calculation complete"
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(debug=True, port=5000)