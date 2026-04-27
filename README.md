# 🏁 Dynamic Grip Coefficient (DGC) Module

**Description**
A self-contained Python module that calculates a real-time Dynamic Grip Coefficient (DGC) for track racing. It combines an explainable baseline estimator (using track temperature, humidity, cloud cover, and wind) with an optional machine learning residual model (RandomForest) trained on vehicle telemetry to provide highly accurate (for the most part) sector-by-sector grip predictions!

**Features**
* **Baseline GripIndex:** Calculates expected grip using environmental factors.
* **Residual ML Model:** Trains a RandomForest regressor to predict sector time residuals based on driver telemetry (exit speed, braking).
* **Live Inference (`infer_grip`):** Real-time API for predicting grip percentage, sector time delta, and confidence scores! 
* **Demo Mode:** Generates synthetic racing data if no CSVs are provided so you can test it immediately! 

**Prerequisites**
Make sure you install the required libraries!
```bash
pip install pandas numpy scikit-learn joblib
```

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

***

# 🏎️ Overtake Probability Engine API

**Description**
A lightweight Flask REST API that acts as the "Brain" for predicting racing overtakes! It listens for live dashboard data, calculates dynamic features like DRS availability, and feeds the data into a pre-trained machine learning model to calculate the exact percentage chance of a successful pass!

**Features**
* **Fast API Endpoint:** Exposes a `/predict` POST route for seamless dashboard integration.
* **Dynamic Feature Engineering:** Automatically infers DRS availability based on the gap to the target!
* **CORS Enabled:** Ready to talk to your frontend web dashboards right out of the box!

**Prerequisites**
You need these libraries to make the server run perfectly! 
```bash
pip install Flask flask-cors pandas numpy scikit-learn joblib
```
*(Make sure your `overtake_probability_model.joblib` is in the same directory!)*

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

***
