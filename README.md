<p align="center">
   <img src="https://c.tenor.com/Zuu-LyyFdGwAAAAd/tenor.gif" alt="Toyota GR">
</p>

# 🏎️ Circuit OS (Gazoo Razoo) 
**The Central Intelligence Hub for Modern Racing**

Circuit OS is an advanced, real-time race prediction and telemetry analysis engine built for the **Toyota GR Hackathon**. By combining environmental baselines with highly trained machine learning models, Circuit OS processes live vehicle data to predict racing outcomes, track conditions, and driver behavior with extreme precision. 

---

## 🏁 Module 1: Dynamic Grip Coefficient (DGC) 

**Description**
A self-contained Python module that calculates a real-time Dynamic Grip Coefficient (DGC) for track racing. It combines an explainable baseline estimator (using track temperature, humidity, cloud cover, and wind) with an optional machine learning residual model (`RandomForest`) trained on vehicle telemetry to provide highly accurate sector-by-sector grip predictions!

**Features**
* **Baseline GripIndex:** Calculates expected grip using environmental factors.
* **Residual ML Model:** Trains a RandomForest regressor to predict sector time residuals based on driver telemetry (exit speed, braking).
* **Live Inference (`infer_grip`):** Real-time API for predicting grip percentage, sector time delta, and confidence scores! 
* **Demo Mode:** Generates synthetic racing data if no CSVs are provided so you can test it immediately! 

**Usage**
To run the interactive demo and see the magic happen:
```bash
python3 dynamic_grip_module.py
```
To use the live inference in your own scripts:
```python
from dynamic_grip_module import infer_grip, load_residual_model

# Load the trained model
rf_model, baselines = load_residual_model('rf_residual_model.joblib')

# Feed it weather and telemetry!
prediction = infer_grip(weather_row_dict, telemetry_summary_dict, residual_rf=rf_model)
print(prediction['grip_percent'])
```

---

## 🚀 Module 2: Overtake Probability Engine API

**Description**
A lightweight Flask REST API that acts as the "Brain" for predicting racing overtakes! It listens for live dashboard data, calculates dynamic features like DRS availability, and feeds the data into a pre-trained machine learning model to calculate the exact percentage chance of a successful pass!

**Features**
* **Fast API Endpoint:** Exposes a `/predict` POST route for seamless dashboard integration.
* **Dynamic Feature Engineering:** Automatically infers DRS availability based on the gap to the target!
* **CORS Enabled:** Ready to talk to your frontend web dashboards right out of the box!

**Usage**
Start the server:
```bash
python3 overtake_api.py
```
Send a POST request to `http://localhost:5000/predict` with your live racing data:
```json
{
  "gap": 0.8,
  "time_diff": -0.2,
  "speed_diff": 4.5
}
```
**Response:**
```json
{
  "success": true,
  "overtake_probability": 87.5,
  "message": "Calculation complete"
}
```

---

## 🧬 Module 3: Driver DNA & Throttle Metrics

**Description**
A robust time-series feature extraction pipeline that profiles user racing behavior. By parsing raw vehicle state arrays (APS, PBrake, Speed, Elapsed Time), this module extracts complex post-apex throttle metrics to identify unique driver tendencies and acceleration curves.

**Features**
* **Time-to-Full-Throttle Tracking:** Detects throttle segment ramps and precisely calculates threshold crossings to profile corner-exit aggression.
* **Robust Edge-Case Handling:** Accurately reports `NaN` values for drivers already at 100% throttle prior to apex thresholds. 
* **Test-Driven Architecture:** Fully validated edge cases using Python’s `unittest` framework to ensure high-fidelity data processing.

**Usage**
To run the unit tests and validate the throttle detection logic against synthetic telemetry ramps:
```bash
python3 -m unittest tests/test_throttle_metrics.py
```

---

### 🛠️ Prerequisites & Installation
Make sure you install the required libraries before trying to run my code! 
```bash
pip install pandas numpy scikit-learn joblib Flask flask-cors
```
*(Make sure your `overtake_probability_model.joblib` is in the correct directory!)*
