import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report
import joblib 

# --- Loading Training Data ---
print("--- Loading Training Data ---")
try:
    # Load data from Race 1
    df_train_r1 = pd.read_csv("Overtake Probability Engine/training_data_r1.csv")
    print(f"Loaded training_data_r1.csv (Race 1) with {len(df_train_r1)} samples.")
    df_train_r1.columns = df_train_r1.columns.str.strip() # Clean columns

    # Load data from Race 2
    df_train_r2 = pd.read_csv("Overtake Probability Engine/training_data_r2.csv")
    print(f"Loaded training_data_r2.csv (Race 2) with {len(df_train_r2)} samples.")
    df_train_r2.columns = df_train_r2.columns.str.strip() # Clean columns

    # --- Combine the datasets ---
    df_train = pd.concat([df_train_r1, df_train_r2], ignore_index=True)
    print(f"Combined dataset has {len(df_train)} total samples.")

    # Check for missing values
    # Drop rows with missing values in key columns
    key_features = ['Gap_At_P1', 'T11_Time_Diff', 'Exit_Speed_Diff', 'DRS_Available', 'Successful_Pass'] 
    
    # Verify columns exist before dropping
    missing_cols = [col for col in key_features if col not in df_train.columns]
    if missing_cols:
        print(f"Error: The following columns are missing from your CSVs: {missing_cols}")
        print("Did you remember to update and RUN your training_data_R1/R2 scripts?")
        exit()
        
    df_train = df_train.dropna(subset=key_features)
    print(f"Samples remaining after NaN check: {len(df_train)}")

except FileNotFoundError as e:
    print(f"Error: Could not find training data file: {e}")
    exit()
except Exception as e:
    print(f"Error loading data: {e}")
    exit()

if df_train.empty:
    print("Error: No data available for training.")
    exit()

print("\n--- Model Training (Random Forest) ---")

# --- a) Define Features (X) and Target (y) ---
feature_columns = [
    'Gap_At_P1',
    'T11_Time_Diff', 
    'Exit_Speed_Diff',
    'DRS_Available' # New Feature!
]

X = df_train[feature_columns]
y = df_train['Successful_Pass']

print(f"Features (X) shape: {X.shape}")
print(f"Target (y) shape: {y.shape}")
print(f"Class distribution:\n{y.value_counts(normalize=True)}") 

# --- b) Split Data ---
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

print(f"Training set size: {len(X_train)}")
print(f"Testing set size: {len(X_test)}")

# --- c) Initialize and Train Random Forest Model ---
# n_estimators: Number of trees
# min_samples_leaf: Keeps the model from getting too specific on small data
model = RandomForestClassifier(
    n_estimators=100, 
    random_state=42, 
    class_weight='balanced', 
    min_samples_leaf=3 
)
model.fit(X_train, y_train)

print("Random Forest model trained successfully.")

# --- d) Evaluate the Model ---
print("\n--- Model Evaluation ---")
y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy on Test Set: {accuracy:.4f}")

print("\nConfusion Matrix:")
print(confusion_matrix(y_test, y_pred))

print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=['No Pass (0)', 'Pass (1)']))

# --- e) Feature Importances ---
# This replaces "Coefficients" for Random Forest
print("\nFeature Importances:")
try:
    importances = pd.DataFrame(model.feature_importances_, index=X.columns, columns=['Importance'])
    importances = importances.sort_values(by='Importance', ascending=False)
    print(importances)
    print("\nInterpretation: Higher 'Importance' means this feature was more useful for predicting the pass.")
except Exception as e:
    print(f"Could not display feature importances: {e}")

# --- f) Save the Model ---
model_filename = 'overtake_probability_model.joblib'
try:
    joblib.dump(model, model_filename)
    print(f"\nModel saved successfully as '{model_filename}'")
except Exception as e:
    print(f"\nError saving model: {e}")