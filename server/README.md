# GazooRazoo Analysis API

This is a FastAPI backend that runs the Python analysis logic for the GazooRazoo dashboard.

## Setup

1.  **Install Python 3.10+** if you haven't already.
2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## Running the Server

Run the server from the root of the workspace (so it can find `Module 2`):

```bash
python server/api.py
```

The server will start at `http://localhost:8000`.

## API Endpoints

### `POST /analyze-dna`

Analyzes driver DNA based on telemetry and lap data.

**Request Body:**
```json
{
  "telemetryPath": "path/to/telemetry.csv",
  "lapsPath": "path/to/laps.csv",
  "driverId": "GR86-XXX-XX",
  "driverNumber": 99
}
```

**Response:**
Returns JSON containing:
- `optimalLaps`: List of lap numbers used for baseline.
- `style`: Driver style classification (e.g., "LATE STOMPER / SMOOTH ROLLER").
- `dna`: Baseline brake and throttle signatures (arrays of 30 points).
