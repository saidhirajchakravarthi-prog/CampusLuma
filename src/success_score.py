"""Transparent, configurable prototype score; weights are policy choices, not validated science."""
import math
CATEGORY_FIELDS = {
    "academic": ["cgpa", "marks", "backlogs", "subject_performance"],
    "attendance": ["attendance", "subject_attendance"],
    "lms": ["lms_logins", "assignment_completion", "learning_activity"],
    "engagement": ["clubs", "events", "hackathons", "certifications"],
    "placement": ["aptitude", "coding_assessment", "mock_interview"],
    "skills": ["technical_skills", "soft_skills"],
    "feedback": ["student_satisfaction", "faculty_feedback"],
}
DEFAULT_WEIGHTS = {
    "academic": 0.25, "attendance": 0.15, "lms": 0.12,
    "engagement": 0.10, "placement": 0.18, "skills": 0.12, "feedback": 0.08,
}


def _normalized(field, value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if field == "cgpa":
        return max(0, min(100, number / 10 * 100))
    if field == "backlogs":
        return max(0, min(100, 100 - number * 20))
    if field in {"clubs", "events", "hackathons", "certifications", "lms_logins", "learning_activity"}:
        return max(0, min(100, number / 10 * 100))
    return max(0, min(100, number))


def calculate_success_score(student, min_coverage=0.5, weights=None):
    weights = dict(DEFAULT_WEIGHTS if weights is None else weights)
    if set(weights) != set(CATEGORY_FIELDS) or any(not math.isfinite(float(value)) or float(value) < 0 for value in weights.values()) or sum(float(v) for v in weights.values()) <= 0:
        raise ValueError("Weights must provide a nonnegative value for each score category, with a positive total")
    weights = {key: float(value) / sum(float(v) for v in weights.values()) for key, value in weights.items()}
    if not 0 <= min_coverage <= 1:
        raise ValueError("min_coverage must be between 0 and 1")
    category_scores = {}
    coverage_weight = 0
    weighted_sum = 0
    available = 0
    for category, fields in CATEGORY_FIELDS.items():
        values = [_normalized(field, student.get(field)) for field in fields]
        values = [value for value in values if value is not None]
        if values:
            score = sum(values) / len(values)
            category_scores[category] = round(score, 1)
            weighted_sum += score * weights[category]
            coverage_weight += weights[category]
            available += len(values)
        else:
            category_scores[category] = None
    coverage = coverage_weight  # represents the share of category weight with data
    calculated_score = round(weighted_sum / coverage_weight, 1) if coverage_weight else None
    sufficiently_covered = coverage >= min_coverage and calculated_score is not None
    return {
        "score": calculated_score if sufficiently_covered else None,
        "provisional_score": calculated_score if not sufficiently_covered else None,
        "reliable": sufficiently_covered,
        "coverage": round(coverage, 3),
        "coverage_percent": round(coverage * 100),
        "categories_observed": sum(score is not None for score in category_scores.values()),
        "indicators_observed": available,
        "category_scores": category_scores,
        "weights": weights,
        "method": "Mean of available normalized indicators within each category, combined by the configured category weights and renormalized over observed categories. Prototype weights are configurable policy assumptions, not scientifically validated.",
    }
