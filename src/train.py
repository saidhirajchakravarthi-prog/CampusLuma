"""Train and evaluate the experimental Random Forest model (run explicitly)."""
import json

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split

from src.preprocess import DATA_PATH, FEATURES, MODEL_PATH, make_pipeline


def train():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training data not found: {DATA_PATH}. Run `python data/generate_data.py` for labeled synthetic development data.")
    data = pd.read_csv(DATA_PATH)
    required = set(FEATURES + ["pass"])
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"Training data is missing columns: {', '.join(sorted(missing))}")
    data = data.dropna(subset=["pass"])
    X = data[FEATURES]
    y = pd.to_numeric(data["pass"], errors="raise")
    if not y.isin([0, 1]).all() or set(y.unique()) != {0, 1}:
        raise ValueError("The pass label must contain both 0 and 1")
    y = y.astype(int)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    pipeline = make_pipeline(RandomForestClassifier(
        n_estimators=300, min_samples_leaf=3, class_weight="balanced", random_state=42
    ))
    pipeline.fit(X_train, y_train)
    predicted = pipeline.predict(X_test)
    probabilities = pipeline.predict_proba(X_test)[:, list(pipeline.classes_).index(1)]
    metrics = {
        "evaluation": "held-out random split; synthetic generated labels; experimental only",
        "rows_train": len(X_train), "rows_test": len(X_test),
        "accuracy": float(accuracy_score(y_test, predicted)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, predicted)),
        "f1": float(f1_score(y_test, predicted, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    (MODEL_PATH.parent / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    train()
