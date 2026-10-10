"""Shared input validation and preprocessing definitions for the ML pipeline."""
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "student_data.csv"
MODEL_PATH = ROOT / "models" / "model.pkl"
FEATURES = ["study_hours", "attendance", "assignments", "quizzes"]
RANGES = {
    "study_hours": (0, 24),
    "attendance": (0, 100),
    "assignments": (0, 100),
    "quizzes": (0, 100),
}


def validate_features(data: dict) -> pd.DataFrame:
    """Return a one-row numeric frame, rejecting unknown, invalid, or out-of-range values."""
    unknown = set(data) - set(FEATURES)
    if unknown:
        raise ValueError(f"Unknown feature(s): {', '.join(sorted(unknown))}")
    row = {}
    for name in FEATURES:
        value = data.get(name)
        if value is None or value == "":
            row[name] = float("nan")
            continue
        try:
            row[name] = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name} must be numeric") from exc
        low, high = RANGES[name]
        if not low <= row[name] <= high:
            raise ValueError(f"{name} must be between {low} and {high}")
    if all(pd.isna(v) for v in row.values()):
        raise ValueError("At least one feature is required")
    return pd.DataFrame([row], columns=FEATURES)


def make_pipeline(classifier):
    numeric = Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ])
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", numeric, FEATURES)])),
        ("classifier", classifier),
    ])
