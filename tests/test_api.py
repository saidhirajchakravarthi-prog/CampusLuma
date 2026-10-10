import json

from fastapi.testclient import TestClient

import main
import src.database as database


def test_import_persists_and_role_controls_mutations(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff", "reader-token": "viewer"}))
    with TestClient(main.app) as client:
        no_auth = client.get("/overview")
        assert no_auth.status_code == 401
        headers = {"Authorization": "Bearer staff-token"}
        response = client.post("/imports", headers=headers,
                               files={"file": ("students.csv", b"student_id,attendance,cgpa,aptitude\nS1,80,8,40\n", "text/csv")})
        assert response.status_code == 200
        assert response.json()["imported_rows"] == 1
        assert client.get("/students", headers=headers).json()[0]["student_id"] == "S1"
        partial = client.post("/imports", headers=headers,
                              files={"file": ("partial.csv", b"student_id,cgpa,attendance,aptitude\nS1,9,,\nS1,8,70,30\n", "text/csv")})
        assert partial.status_code == 200
        assert partial.json()["imported_rows"] == 1
        assert partial.json()["errors"][0]["message"] == "Duplicate student_id within uploaded file"
        profile = client.get("/students/S1", headers=headers).json()
        assert profile["data"]["cgpa"] == 9
        assert profile["data"]["attendance"] == 80
        assert profile["data"]["aptitude"] == 40
        reader = {"Authorization": "Bearer reader-token"}
        denied = client.post("/imports", headers=reader,
                             files={"file": ("students.csv", b"student_id\nS2\n", "text/csv")})
        assert denied.status_code == 403


def test_prediction_reports_missing_artifact_as_service_unavailable(tmp_path, monkeypatch):
    import src.predict as prediction

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "predict.db")
    monkeypatch.setattr(prediction, "MODEL_PATH", tmp_path / "missing-model.pkl")
    monkeypatch.setattr(prediction, "_model", None)
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"test-token": "analyst"}))
    with TestClient(main.app) as client:
        response = client.post("/predict", headers={"Authorization": "Bearer test-token"},
                               json={"study_hours": 4, "attendance": 70})
        assert response.status_code == 503
