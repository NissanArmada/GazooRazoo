import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report
from sklearn.preprocessing import StandardScaler # Optional: For feature scaling
import joblib # For saving the model

# --- Loading Training Data ---
print("--- Loading Training Data ---")
try:
    # Load data from Race 1
    df_train_r1 = pd.read_csv("training_data.csv")
    print(f"Loaded training_data.csv (Race 1) with {len(df_train_r1)} samples.")

    # Load data from Race 2
    df_train_r2 = pd.read_csv("training_data_race2.csv")
    print(f"Loaded training_data_race2.csv (Race 2) with {len(df_train_r2)} samples.")

    # --- Combine the datasets ---
    df_train = pd.concat([df_train_r1, df_train_r2], ignore_index=True)
    print(f"Combined dataset has {len(df_train)} total samples.")

    # Basic check for missing values
    print(f"Missing values before proceeding:\n{df_train.isnull().sum()}")
    # Drop any remaining rows with missing values in key columns if necessary
    key_features = ['Gap_At_P1', 'T11_Time_Diff', 'Exit_Speed_Diff', 'Successful_Pass'] # Adjust if columns differ
    missing_keys = [col for col in key_features if col not in df_train.columns]
    if missing_keys:
        print(f"Error: Missing expected columns for training: {missing_keys}")
    else:
        df_train = df_train.dropna(subset=key_features)
        print(f"Samples remaining after final NaN check: {len(df_train)}")

# Handle potential file errors
except FileNotFoundError as e:
    print(f"Error: Could not find one of the training data CSV files: {e}")
    exit()
except Exception as e:
    print(f"Error loading or cleaning data: {e}")
    exit()

print("\n--- Model Training ---")

# --- a) Define Features (X) and Target (y) ---
# Select the columns you want to use as predictors
# It's often best to start simple and add more features later
feature_columns = [
    'Gap_At_P1',
    'T11_Time_Diff', # Difference in corner time (Car A - Car B)
    'Exit_Speed_Diff' # Difference in corner exit speed (Car A - Car B)
    # Add other features if desired, e.g., 'Car_A_Exit_Speed', 'Car_B_Exit_Speed'
]

# Ensure selected feature columns exist in the DataFrame
actual_features = [col for col in feature_columns if col in df_train.columns]
missing_features = [col for col in feature_columns if col not in actual_features]
if missing_features:
    print(f"Warning: The following feature columns were not found and will be excluded: {missing_features}")
if not actual_features:
     print("Error: No valid feature columns selected or found. Exiting.")
     exit()

X = df_train[actual_features]
y = df_train['Successful_Pass'] # Your target variable

print(f"Features (X) shape: {X.shape}")
print(f"Target (y) shape: {y.shape}")
print(f"Class distribution:\n{y.value_counts(normalize=True)}") # Check if data is imbalanced

# --- b) Split Data into Training and Testing Sets ---
# test_size=0.2 means 20% of data is held back for testing
# random_state ensures reproducibility
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y) # Use stratify for imbalanced data if needed

print(f"Training set size: {len(X_train)}")
print(f"Testing set size: {len(X_test)}")

# --- c) Optional: Scale Features ---
# Logistic Regression can benefit from scaling, especially if features have very different ranges
# scaler = StandardScaler()
# X_train_scaled = scaler.fit_transform(X_train)
# X_test_scaled = scaler.transform(X_test)
# print("Features scaled using StandardScaler.")
# # Use X_train_scaled and X_test_scaled instead of X_train, X_test below if scaling

# --- d) Initialize and Train Logistic Regression Model ---
# We use the raw (or scaled) training data here
model = LogisticRegression(random_state=42) # You can adjust hyperparameters later
# model.fit(X_train_scaled, y_train) # Use this if features were scaled
model.fit(X_train, y_train)

print("Logistic Regression model trained successfully.")

# --- e) Evaluate the Model ---
print("\n--- Model Evaluation ---")
# Predict on the test set (using scaled or unscaled data as appropriate)
# y_pred = model.predict(X_test_scaled) # Use this if features were scaled
y_pred = model.predict(X_test)

# Calculate Accuracy
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy on Test Set: {accuracy:.4f}")

# Confusion Matrix
print("\nConfusion Matrix:")
cm = confusion_matrix(y_test, y_pred)
print(cm)
# Interpretation:
# [[TN, FP],
#  [FN, TP]]
# TN = True Negatives (Predicted No Pass, Actual No Pass)
# FP = False Positives (Predicted Pass, Actual No Pass) - Type I Error
# FN = False Negatives (Predicted No Pass, Actual Pass) - Type II Error
# TP = True Positives (Predicted Pass, Actual Pass)

# Classification Report (Precision, Recall, F1-Score)
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=['No Pass (0)', 'Pass (1)']))

# --- f) Interpret Coefficients (Optional) ---
# Shows how features influence the prediction probability
print("\nModel Coefficients:")
try:
    coefficients = pd.DataFrame(model.coef_[0], X.columns, columns=['Coefficient'])
    print(coefficients)
    print("\nInterpretation:")
    print("- Positive coefficient: Increases the log-odds (and probability) of a pass.")
    print("- Negative coefficient: Decreases the log-odds (and probability) of a pass.")
    print("- Larger absolute value: Stronger influence.")
except Exception as e:
    print(f"Could not display coefficients: {e}")


# --- g) Save the Trained Model (and scaler if used) ---
# This part you would run locally, not here.
# It saves the model object to a file.
model_filename = 'overtake_probability_model.joblib'
# scaler_filename = 'overtake_data_scaler.joblib' # Save scaler if you used it

try:
    joblib.dump(model, model_filename)
    print(f"\nModel saved successfully as '{model_filename}'")
    # if 'scaler' in locals(): # Check if scaler exists
    #    joblib.dump(scaler, scaler_filename)
    #    print(f"Scaler saved successfully as '{scaler_filename}'")

except Exception as e:
    print(f"\nError saving model: {e}")
    print("Ensure you have write permissions in the directory.")


print("\n--- Next Steps ---")
print("1. Analyze the evaluation metrics (Accuracy, Confusion Matrix, Precision/Recall).")
print("2. If performance is low, consider:")
print("   - Adding more relevant features (e.g., specific speeds, DRS status if available).")
print("   - Trying different models (e.g., RandomForestClassifier, GradientBoostingClassifier).")
print("   - Tuning model hyperparameters.")
print("   - Getting more data!")
print(f"3. Use the saved '{model_filename}' (and scaler if saved) in your real-time prediction engine.")
