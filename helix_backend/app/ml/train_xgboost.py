"""Bootstrap training only. Replace with clinically validated labelled data before deployment."""
from pathlib import Path
import joblib
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

MODEL_PATH = Path("models/emergency_health_xgb.joblib")
FEATURES = [
    "age", "waiting_minutes", "symptom_severity", "current_condition_severity",
    "history_condition_count", "history_high_risk", "breathing_difficulty",
    "chest_pain", "consciousness_change", "fever_c", "pain_score"
]

def main():
    rng = np.random.default_rng(42)
    n = 2500
    X = np.column_stack([
        rng.integers(1, 90, n), rng.integers(0, 240, n), rng.integers(0, 10, n),
        rng.integers(0, 10, n), rng.integers(0, 8, n), rng.integers(0, 2, n),
        rng.integers(0, 2, n), rng.integers(0, 2, n), rng.integers(0, 2, n),
        rng.normal(37, 3, n).clip(35, 42), rng.integers(0, 11, n)
    ])
    y = (0.12*X[:,1] + 6*X[:,2] + 7*X[:,3] + 7*X[:,4] + 18*X[:,5] +
         18*X[:,6] + 16*X[:,7] + 16*X[:,8] + 3*np.maximum(X[:,9]-37,0) + 2*X[:,10] + 3*X[:,0]/90)
    y = np.clip(y + rng.normal(0, 5, n), 0, 100)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=.2, random_state=42)
    model = XGBRegressor(n_estimators=300, max_depth=5, learning_rate=.05, subsample=.85, colsample_bytree=.85, objective="reg:squarederror", random_state=42)
    model.fit(Xtr, ytr)
    pred = model.predict(Xte)
    print("Bootstrap MAE:", mean_absolute_error(yte, pred))
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "version": "bootstrap-v1"}, MODEL_PATH)
    print("Saved", MODEL_PATH)

if __name__ == "__main__": main()
