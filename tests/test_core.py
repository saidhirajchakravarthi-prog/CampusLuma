import pytest

from src.preprocess import validate_features
from src.success_score import calculate_success_score


def test_feature_validation_allows_missing_values_and_preserves_order():
    frame = validate_features({"attendance": 80, "study_hours": 4})
    assert list(frame.columns) == ["study_hours", "attendance", "assignments", "quizzes"]
    assert frame.iloc[0]["attendance"] == 80


@pytest.mark.parametrize("value", [-1, 101])
def test_feature_validation_rejects_out_of_range_attendance(value):
    with pytest.raises(ValueError):
        validate_features({"attendance": value})


def test_score_reports_insufficient_coverage_instead_of_reliable_overall_score():
    result = calculate_success_score({"attendance": 90})
    assert result["score"] is None
    assert result["provisional_score"] == 90
    assert result["reliable"] is False
    assert result["coverage_percent"] == 15


def test_score_uses_all_categories_and_explains_weights():
    result = calculate_success_score({
        "cgpa": 8, "attendance": 80, "lms_logins": 5, "clubs": 5,
        "aptitude": 70, "technical_skills": 75, "student_satisfaction": 90,
    })
    assert result["categories_observed"] == 7
    assert result["reliable"] is True
    assert sum(result["weights"].values()) == pytest.approx(1)


def test_score_weights_can_be_configured():
    weights = {key: 0 for key in ("academic", "attendance", "lms", "engagement", "placement", "skills", "feedback")}
    weights["academic"] = 1
    result = calculate_success_score({"cgpa": 8, "attendance": 20}, weights=weights)
    assert result["score"] == 80
    assert result["weights"]["academic"] == 1
