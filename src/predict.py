"""Inference helpers. Model artifacts load lazily; application startup never trains."""
import joblib
import pandas as pd

from src.preprocess import FEATURES, MODEL_PATH, validate_features

_model = None


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError("Model artifact is missing. Generate development data and run `python -m src.train` first.")
        _model = joblib.load(MODEL_PATH)
    return _model


def get_risk(probability):
    if probability < 0.4:
        return "High Risk"
    if probability < 0.7:
        return "Medium Risk"
    return "Low Risk"


def get_intervention(data):
    suggestions = []
    if data.get("attendance") is not None and float(data["attendance"]) < 75:
        suggestions.append("Review attendance barriers and agree on a support plan")
    if data.get("study_hours") is not None and float(data["study_hours"]) < 4:
        suggestions.append("Agree on a manageable weekly study schedule")
    if data.get("assignments") is not None and float(data["assignments"]) < 60:
        suggestions.append("Offer assignment planning and subject support")
    if data.get("quizzes") is not None and float(data["quizzes"]) < 60:
        suggestions.append("Offer targeted concept revision and practice")
    return suggestions or ["Continue regular check-ins and monitor progress"]


def predict_student(input_dict):
    frame = validate_features(input_dict)
    model = get_model()
    probabilities = model.predict_proba(frame)[0]
    classes = list(model.classes_)
    positive_index = classes.index(1) if 1 in classes else classes.index(True)
    probability = float(probabilities[positive_index])
    prediction = int(model.predict(frame)[0])
    coverage = sum(not pd.isna(frame.iloc[0][feature]) for feature in FEATURES) / len(FEATURES)
    contributing_factors = [
        {"feature": feature, "value": float(frame.iloc[0][feature]), "rule": "below 60%"}
        for feature in ("attendance", "assignments", "quizzes")
        if not pd.isna(frame.iloc[0][feature]) and frame.iloc[0][feature] < 60
    ]
    if not pd.isna(frame.iloc[0]["study_hours"]) and frame.iloc[0]["study_hours"] < 4:
        contributing_factors.append({"feature": "study_hours", "value": float(frame.iloc[0]["study_hours"]), "rule": "below 4 hours per day"})
    return {
        "prediction": "Pass" if prediction == 1 else "Fail",
        "probability": probability,
        "risk_level": get_risk(probability),
        "interventions": get_intervention(input_dict),
        "data_coverage": coverage,
        "interpretation_reliable": coverage >= 0.75,
        "contributing_factors": contributing_factors,
        "factor_method": "Transparent intervention heuristics; these are not causal effects or model feature attributions.",
        "experimental": True,
        "model_note": "Experimental model trained on synthetic development data; not validated for real student decisions.",
    }
