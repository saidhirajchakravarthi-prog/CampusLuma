import json
import io
from datetime import timedelta

import pandas as pd
from fastapi.testclient import TestClient

import main
import src.auth as auth
import pytest

import src.database as database


def test_firebase_mode_rejects_missing_or_default_jwt_secret(monkeypatch):
    monkeypatch.setenv("CAMPUS_AUTH_MODE", "firebase")
    monkeypatch.delenv("CAMPUS_JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="deployment-specific CAMPUS_JWT_SECRET"):
        auth.validate_runtime_auth_configuration()

    for invalid_secret in (auth._DEFAULT_DEV_SECRET, "replace-with-a-random-32-byte-secret-key-for-jwt-signing"):
        monkeypatch.setenv("CAMPUS_JWT_SECRET", invalid_secret)
        with pytest.raises(RuntimeError, match="deployment-specific CAMPUS_JWT_SECRET"):
            auth.validate_runtime_auth_configuration()

    monkeypatch.setenv("CAMPUS_JWT_SECRET", "a" * 32)
    auth.validate_runtime_auth_configuration()


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


def test_student_pagination_and_departments(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pagination.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    with TestClient(main.app) as client:
        csv_data = (
            "student_id,name,department,semester,cohort,cgpa,attendance\n"
            "S101,Alice,Computer Science,3,2026,8.5,90\n"
            "S102,Bob,Computer Science,3,2026,7.2,85\n"
            "S103,Charlie,Mechanical,5,2027,6.8,75\n"
            "S104,Diana,Mechanical,5,2027,9.1,95\n"
            "S105,Evan,Computer Science,3,2026,5.5,60\n"
        )
        res = client.post("/imports", headers=headers, files={"file": ("students.csv", csv_data.encode("utf-8"), "text/csv")})
        assert res.status_code == 200

        all_students = client.get("/students", headers=headers).json()
        assert isinstance(all_students, list)
        assert len(all_students) == 5

        paginated = client.get("/students?page=1&page_size=2", headers=headers).json()
        assert isinstance(paginated, dict)
        assert paginated["total"] == 5
        assert paginated["page"] == 1
        assert paginated["page_size"] == 2
        assert paginated["pages"] == 3
        assert len(paginated["items"]) == 2

        cs_students = client.get("/students?department=Computer Science&page=1&page_size=10", headers=headers).json()
        assert cs_students["total"] == 3

        cohort_students = client.get("/students?cohort=2027&page=1&page_size=10", headers=headers).json()
        assert cohort_students["total"] == 2
        assert {student["cohort"] for student in cohort_students["items"]} == {"2027"}
        unknown_risk = client.get("/students?risk_level=Unknown&page=1&page_size=10", headers=headers).json()
        assert unknown_risk["total"] == 5
        invalid_risk = client.get("/students?risk_level=Critical&page=1&page_size=10", headers=headers)
        assert invalid_risk.status_code == 422

        depts = client.get("/students/departments", headers=headers).json()
        assert sorted(depts) == ["Computer Science", "Mechanical"]


def test_model_status_and_overview_departments(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "status.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff", "viewer-token": "viewer"}))
    with TestClient(main.app) as client:
        viewer_headers = {"Authorization": "Bearer viewer-token"}
        status_res = client.get("/model/status", headers=viewer_headers)
        assert status_res.status_code == 200
        data = status_res.json()
        assert "status" in data
        assert "experimental" in data
        assert "same four input features" in data["note"]

        dept_overview = client.get("/overview/departments", headers=viewer_headers)
        assert dept_overview.status_code == 200
        assert isinstance(dept_overview.json(), list)


def test_reports_students_csv_and_imports_detail(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "reports.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    with TestClient(main.app) as client:
        csv_data = "student_id,name,department,cgpa,attendance,data_origin\nS201,Frank,Commerce,7.5,88,SYNTHETIC_TEST_ONLY\n"
        import_res = client.post("/imports", headers=headers, files={"file": ("test.csv", csv_data.encode("utf-8"), "text/csv")})
        assert import_res.status_code == 200
        import_id = import_res.json()["import_id"]

        detail = client.get(f"/imports/{import_id}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["source"] == "test.csv"
        assert detail.json()["imported_rows"] == 1

        csv_report = client.get("/reports/students.csv", headers=headers)
        assert csv_report.status_code == 200
        assert "text/csv" in csv_report.headers["content-type"]
        assert "S201" in csv_report.text
        csv_frame = pd.read_csv(io.StringIO(csv_report.text))
        assert csv_frame.loc[0, "data_origin"] == "SYNTHETIC_TEST_ONLY"
        assert csv_frame.loc[0, "source_file"] == "test.csv"
        xlsx_report = client.get("/reports/students.xlsx", headers=headers)
        assert xlsx_report.status_code == 200
        assert "spreadsheetml.sheet" in xlsx_report.headers["content-type"]
        workbook = pd.read_excel(io.BytesIO(xlsx_report.content))
        assert workbook.loc[0, "department"] == "Commerce"
        assert workbook.loc[0, "data_origin"] == "SYNTHETIC_TEST_ONLY"
        pdf_report = client.get("/reports/summary.pdf", headers=headers)
        assert pdf_report.status_code == 200
        assert pdf_report.headers["content-type"] == "application/pdf"
        assert pdf_report.content.startswith(b"%PDF-")
        assert len(pdf_report.content) > 1000
        assert b"Profile provenance" in pdf_report.content
        assert b"synthetic-labelled" in pdf_report.content


def test_excel_import_with_explicit_header_mapping(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "excel.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    output = io.BytesIO()
    pd.DataFrame({"Roll No": ["S401"], "CGPA": [8.25], "Attendance %": [92]}).to_excel(output, index=False)
    with TestClient(main.app) as client:
        response = client.post(
            "/imports",
            headers=headers,
            params={"mapping": json.dumps({"student_id": "Roll No", "cgpa": "CGPA", "attendance": "Attendance %"})},
            files={"file": ("students.xlsx", output.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert response.status_code == 200
        assert response.json()["imported_rows"] == 1
        profile = client.get("/students/S401", headers=headers).json()
        assert profile["data"]["cgpa"] == 8.25
        assert profile["data"]["attendance"] == 92


def test_interventions_and_profile_integration(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "interv.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    with TestClient(main.app) as client:
        client.post("/imports", headers=headers, files={"file": ("s.csv", b"student_id,name\nS301,Grace\n", "text/csv")})

        res = client.post("/interventions", headers=headers, json={
            "student_id": "S301",
            "description": "Weekly tutoring check-in",
            "owner": "Prof. Smith",
            "follow_up_date": "2026-11-01"
        })
        assert res.status_code == 200
        int_id = res.json()["id"]
        assert res.json()["status"] == "Open"

        patch_res = client.patch(f"/interventions/{int_id}", headers=headers, json={"status": "In Progress"})
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "In Progress"

        profile = client.get("/students/S301", headers=headers).json()
        assert "interventions" in profile
        assert len(profile["interventions"]) == 1
        assert profile["interventions"][0]["description"] == "Weekly tutoring check-in"
        history = client.get(f"/interventions/{int_id}/history", headers=headers)
        assert history.status_code == 200
        assert [event["action"] for event in history.json()] == ["created", "updated"]
        assert history.json()[-1]["status"] == "In Progress"
        assert history.json()[0]["actor"] == "API token (staff)"


def test_at_risk_returns_observed_category_reasons(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "risk.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    csv_data = (
        "student_id,name,department,cgpa,attendance,lms_logins,clubs,aptitude,technical_skills,student_satisfaction\n"
        "S501,Demo,Computing,4,40,1,1,30,35,30\n"
    )
    with TestClient(main.app) as client:
        uploaded = client.post("/imports", headers=headers, files={"file": ("risk.csv", csv_data.encode(), "text/csv")})
        assert uploaded.status_code == 200
        overview = client.get("/overview", headers=headers).json()
        assert overview["student_count"] == 1
        assert overview["average_attendance"] == 40
        departments = client.get("/overview/departments", headers=headers).json()
        assert departments[0]["department"] == "Computing"
        cohorts = client.get("/cohorts", headers=headers).json()
        assert cohorts[0]["students"] == 1
        result = client.get("/at-risk", headers=headers)
        assert result.status_code == 200
        assert len(result.json()) == 1
        assert result.json()[0]["risk_level"] in {"High Risk", "Medium Risk"}
        assert result.json()[0]["data_coverage"] >= 50
        assert result.json()[0]["contributing_factors"]


def test_import_mapping_rejects_invalid_fields_values_and_missing_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "mapping.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    files = {"file": ("students.csv", b"Roll,CGPA\nS1,8\n", "text/csv")}
    with TestClient(main.app) as client:
        for mapping in (
            {"unknown_field": "Roll"},
            {"student_id": ["Roll"]},
            {"student_id": "Missing"},
            {"student_id": "Roll", "cgpa": "Roll"},
        ):
            response = client.post("/imports", headers=headers, params={"mapping": json.dumps(mapping)}, files=files)
            assert response.status_code == 422


# --- New Tests for Email & Password Sign-In, Password Hashing, JWT Sessions & Role Controls ---

def test_login_successful_and_jwt_session(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "auth_login.db")
    with TestClient(main.app) as client:
        database.initialize()
        # Save a hashed user
        database.save_user(
            email="staff.user@campus.edu",
            name="Academic Staff",
            hashed_password=auth.hash_password("SuperSecurePass123!"),
            role="staff",
        )

        # Successful login
        res = client.post("/auth/login", json={
            "email": "staff.user@campus.edu",
            "password": "SuperSecurePass123!",
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "staff.user@campus.edu"
        assert data["user"]["role"] == "staff"

        # Use JWT token to query /session
        jwt_token = data["access_token"]
        session_res = client.get("/session", headers={"Authorization": f"Bearer {jwt_token}"})
        assert session_res.status_code == 200
        assert session_res.json()["role"] == "staff"
        assert session_res.json()["email"] == "staff.user@campus.edu"
        assert session_res.json()["auth_type"] == "user_session"

        # Check /auth/me
        me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {jwt_token}"})
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "staff.user@campus.edu"

        # Logout endpoint
        logout_res = client.post("/auth/logout")
        assert logout_res.status_code == 200


def test_login_invalid_credentials_and_nonexistent_user(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "auth_invalid.db")
    with TestClient(main.app) as client:
        database.initialize()
        database.save_user(
            email="existing@campus.edu",
            name="Existing User",
            hashed_password=auth.hash_password("CorrectPassword"),
            role="admin",
        )

        # Wrong password
        bad_pw = client.post("/auth/login", json={
            "email": "existing@campus.edu",
            "password": "WrongPassword",
        })
        assert bad_pw.status_code == 401
        assert "Invalid email or password" in bad_pw.json()["detail"]

        # Nonexistent email
        no_user = client.post("/auth/login", json={
            "email": "ghost@campus.edu",
            "password": "CorrectPassword",
        })
        assert no_user.status_code == 401
        assert "Invalid email or password" in no_user.json()["detail"]


def test_firebase_mode_disables_local_login_and_skips_demo_account_bootstrap(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "firebase_mode.db")
    monkeypatch.setenv("CAMPUS_AUTH_MODE", "firebase")
    monkeypatch.setenv("CAMPUS_JWT_SECRET", "test-only-firebase-jwt-secret-with-32-bytes")
    monkeypatch.setenv("CAMPUS_DEV_ACCOUNTS", "true")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_USERS", "")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_ADMIN_EMAIL", "")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_ADMIN_PASSWORD", "")
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    with TestClient(main.app) as client:
        assert database.list_users() == []
        local_login = client.post("/auth/login", json={"email": "admin@campus.edu", "password": "AdminPassword123!"})
        assert local_login.status_code == 404
        firebase_login = client.post("/auth/firebase", json={"id_token": "x" * 30})
        assert firebase_login.status_code == 503
        assert "FIREBASE_PROJECT_ID" in firebase_login.json()["detail"]


def test_firebase_exchange_uses_verified_email_and_database_role(tmp_path, monkeypatch):
    import sys
    import types

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "firebase_exchange.db")
    monkeypatch.setenv("CAMPUS_AUTH_MODE", "firebase")
    monkeypatch.setenv("CAMPUS_JWT_SECRET", "test-only-firebase-jwt-secret-with-32-bytes")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_USERS", "")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_ADMIN_EMAIL", "")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_ADMIN_PASSWORD", "")
    database.initialize()
    database.save_user("viewer@campus.edu", "Campus Viewer", auth.hash_password("unused-local-password"), "viewer")
    verified_claims = {"email": "viewer@campus.edu", "email_verified": True, "role": "admin", "uid": "firebase-uid"}
    fake_auth = types.SimpleNamespace(verify_id_token=lambda token, app, check_revoked: verified_claims)
    monkeypatch.setitem(sys.modules, "firebase_admin", types.SimpleNamespace(auth=fake_auth))
    monkeypatch.setattr(main, "_firebase_admin_app", lambda: object())

    with TestClient(main.app) as client:
        result = client.post("/auth/firebase", json={"id_token": "firebase-id-token-which-is-long-enough"})
        assert result.status_code == 200
        token = result.json()["access_token"]
        session = client.get("/session", headers={"Authorization": f"Bearer {token}"})
        assert session.status_code == 200
        assert session.json()["role"] == "viewer"
        assert session.json()["identity_provider"] == "firebase"
        assert client.get("/students", headers={"Authorization": f"Bearer {token}"}).status_code == 403

    verified_claims["email_verified"] = False
    with TestClient(main.app) as client:
        denied = client.post("/auth/firebase", json={"id_token": "firebase-id-token-which-is-long-enough"})
        assert denied.status_code == 403
        assert "Verify your email" in denied.json()["detail"]


def test_verified_firebase_identity_is_provisioned_as_viewer_without_role_escalation(tmp_path, monkeypatch):
    import sys
    import types

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "firebase_provision.db")
    monkeypatch.setenv("CAMPUS_AUTH_MODE", "firebase")
    monkeypatch.setenv("CAMPUS_JWT_SECRET", "test-only-firebase-jwt-secret-with-32-bytes")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_USERS", "")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_ADMIN_EMAIL", "")
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_ADMIN_PASSWORD", "")
    database.initialize()
    claims = {
        "email": "new.user@campus.edu", "email_verified": True,
        "name": "New User", "role": "admin", "uid": "firebase-new-user",
    }
    fake_auth = types.SimpleNamespace(verify_id_token=lambda token, app, check_revoked: claims)
    monkeypatch.setitem(sys.modules, "firebase_admin", types.SimpleNamespace(auth=fake_auth))
    monkeypatch.setattr(main, "_firebase_admin_app", lambda: object())

    with TestClient(main.app) as client:
        first = client.post("/auth/firebase", json={"id_token": "verified-firebase-token-long-enough"})
        assert first.status_code == 200
        assert first.json()["user"]["role"] == "viewer"
        token = first.json()["access_token"]
        assert client.get("/session", headers={"Authorization": f"Bearer {token}"}).json()["role"] == "viewer"

        # Existing elevated application roles remain controlled by the database.
        database.save_user("admin.user@campus.edu", "Existing Admin", auth.hash_password("unused"), "admin")
        claims["email"] = "admin.user@campus.edu"
        second = client.post("/auth/firebase", json={"id_token": "verified-firebase-token-long-enough"})
        assert second.status_code == 200
        assert second.json()["user"]["role"] == "admin"
        assert len(database.list_users()) == 2


def test_admin_promotion_updates_only_one_existing_active_viewer_without_creating_users(tmp_path, monkeypatch):
    import sys
    import types

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "promotion.db")
    monkeypatch.setenv("CAMPUS_AUTH_MODE", "firebase")
    monkeypatch.setenv("CAMPUS_JWT_SECRET", "test-only-promotion-secret-with-32-bytes")
    claims = {"email": "personal@example.com", "email_verified": True, "name": "Personal Account"}
    fake_auth = types.SimpleNamespace(verify_id_token=lambda token, app, check_revoked: claims)
    monkeypatch.setitem(sys.modules, "firebase_admin", types.SimpleNamespace(auth=fake_auth))
    monkeypatch.setattr(main, "_firebase_admin_app", lambda: object())
    database.initialize()
    database.save_user("personal@example.com", "Personal Account", "existing-hash", "viewer")

    assert database.promote_existing_viewer_to_admin("PERSONAL@example.com") == "promoted"
    updated = database.get_user_by_email("personal@example.com")
    assert updated["role"] == "admin"
    assert updated["name"] == "Personal Account"
    assert updated["hashed_password"] == "existing-hash"
    assert len(database.list_users()) == 1

    with TestClient(main.app) as client:
        response = client.post("/auth/firebase", json={"id_token": "verified-personal-token-long-enough"})
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "admin"
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        for path in ("/students", "/at-risk", "/imports", "/interventions", "/reports/summary.pdf"):
            assert client.get(path, headers=headers).status_code == 200, path


def test_admin_promotion_refuses_missing_inactive_or_non_viewer_accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "promotion_refusals.db")
    database.initialize()

    with pytest.raises(ValueError, match="no account was created"):
        database.promote_existing_viewer_to_admin("missing@example.com")
    assert database.list_users() == []

    database.save_user("inactive@example.com", "Inactive", "hash", "viewer", is_active=0)
    with pytest.raises(ValueError, match="inactive"):
        database.promote_existing_viewer_to_admin("inactive@example.com")
    assert database.get_user_by_email("inactive@example.com")["role"] == "viewer"

    database.save_user("staff@example.com", "Staff", "hash", "staff")
    with pytest.raises(ValueError, match="Only an existing Viewer"):
        database.promote_existing_viewer_to_admin("staff@example.com")
    assert database.get_user_by_email("staff@example.com")["role"] == "staff"


def test_user_cli_promotes_existing_account_only_after_confirmation(tmp_path, monkeypatch, capsys):
    from src import create_user

    db_path = tmp_path / "cli_promotion.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    monkeypatch.setattr(create_user, "DB_PATH", db_path)
    database.initialize()
    database.save_user("personal@example.com", "Personal Account", "keep-this-hash", "viewer")
    monkeypatch.setattr("sys.argv", [
        "src.create_user", "--email", "PERSONAL@example.com", "--role", "admin",
        "--promote-existing-firebase",
    ])
    monkeypatch.setattr("builtins.input", lambda _: "PROMOTE")

    create_user.main()

    assert database.get_user_by_email("personal@example.com")["role"] == "admin"
    assert database.get_user_by_email("personal@example.com")["hashed_password"] == "keep-this-hash"
    assert len(database.list_users()) == 1
    assert "No user was created" in capsys.readouterr().out


def test_jwt_expired_and_tampered_token_rejection(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "auth_token.db")
    with TestClient(main.app) as client:
        database.initialize()

        # Create expired token
        expired_token = auth.create_access_token(
            user_email="expired@campus.edu",
            user_name="Expired User",
            role="admin",
            expires_delta=timedelta(seconds=-10),
        )

        # Attempt to access protected endpoint with expired token
        res_expired = client.get("/overview", headers={"Authorization": f"Bearer {expired_token}"})
        assert res_expired.status_code == 401
        assert "expired" in res_expired.json()["detail"].lower()

        # Attempt with tampered / bogus token
        bogus_res = client.get("/overview", headers={"Authorization": "Bearer this-is-not-a-valid-token"})
        assert bogus_res.status_code == 401


def test_jwt_role_enforcement_on_protected_routes(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "auth_roles.db")
    with TestClient(main.app) as client:
        database.initialize()

        viewer_token = auth.create_access_token(
            user_email="viewer@campus.edu",
            user_name="Viewer User",
            role="viewer",
        )
        staff_token = auth.create_access_token(
            user_email="staff@campus.edu",
            user_name="Staff User",
            role="staff",
        )
        analyst_token = auth.create_access_token(
            user_email="analyst@campus.edu",
            user_name="Analyst User",
            role="analyst",
        )
        admin_token = auth.create_access_token(
            user_email="admin@campus.edu",
            user_name="Admin User",
            role="admin",
        )

        # Viewer can access aggregate overview
        res_view = client.get("/overview", headers={"Authorization": f"Bearer {viewer_token}"})
        assert res_view.status_code == 200

        # Viewer cannot access protected staff/admin endpoints (403 Forbidden)
        res_students_denied = client.get("/students", headers={"Authorization": f"Bearer {viewer_token}"})
        assert res_students_denied.status_code == 403
        assert "cannot perform this action" in res_students_denied.json()["detail"]

        res_at_risk_denied = client.get("/at-risk", headers={"Authorization": f"Bearer {viewer_token}"})
        assert res_at_risk_denied.status_code == 403
        assert client.get("/students", headers={"Authorization": f"Bearer {analyst_token}"}).status_code == 403

        # Staff CAN access student listings
        res_staff_students = client.get("/students", headers={"Authorization": f"Bearer {staff_token}"})
        assert res_staff_students.status_code == 200
        res_admin_students = client.get("/students", headers={"Authorization": f"Bearer {admin_token}"})
        assert res_admin_students.status_code == 200


def test_bootstrap_accounts_via_env(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "bootstrap.db")
    custom_bootstrap = [
        {"email": "superadmin@uni.edu", "name": "Super Admin", "password": "SuperSecretPassword1!", "role": "admin"},
        {"email": "counselor@uni.edu", "name": "Counselor Jane", "password": "CounselorPass1!", "role": "staff"},
    ]
    monkeypatch.setenv("CAMPUS_BOOTSTRAP_USERS", json.dumps(custom_bootstrap))

    with TestClient(main.app) as client:
        # Check users were bootstrapped
        users = database.list_users()
        emails = [u["email"] for u in users]
        assert "superadmin@uni.edu" in emails
        assert "counselor@uni.edu" in emails

        # Verify password is not stored in plaintext
        admin_rec = database.get_user_by_email("superadmin@uni.edu")
        assert admin_rec["hashed_password"].startswith("pbkdf2_sha256$")
        assert "SuperSecretPassword1!" not in admin_rec["hashed_password"]

        # Verify successful login
        res = client.post("/auth/login", json={
            "email": "superadmin@uni.edu",
            "password": "SuperSecretPassword1!",
        })
        assert res.status_code == 200
        assert res.json()["user"]["role"] == "admin"


def test_structured_observation_imports_and_analytics(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "observations.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff", "viewer-token": "viewer"}))
    headers = {"Authorization": "Bearer staff-token"}
    imports = [
        ("subject-performance", b"student_id,subject,term,date,marks,backlogs,data_origin\nS701,Mathematics,Sem 1,2026-09-01,82,0,SYNTHETIC_DEVELOPMENT_ONLY\n"),
        ("attendance-history", b"student_id,date,attended,held,subject\nS701,2026-09-02,8,10,Mathematics\n"),
        ("lms-activity", b"student_id,date,event_type,course,completion_percent\nS701,2026-09-03,assignment,Maths,75\n"),
        ("engagement-activity", b"student_id,date,activity_type,activity_name\nS701,2026-09-04,club,Robotics\n"),
        ("placement-assessment", b"student_id,date,assessment_type,score\nS701,2026-09-05,aptitude,68\n"),
        ("skills-assessment", b"student_id,date,skill_type,skill_name,score\nS701,2026-09-06,technical,Python,72\n"),
        ("feedback", b"student_id,date,respondent_type,score,feedback_category\nS701,2026-09-07,student,4,general\n"),
    ]
    with TestClient(main.app) as client:
        assert client.post("/imports", headers=headers,
                           files={"file": ("students.csv", b"student_id,name\nS701,Demo\n", "text/csv")}).status_code == 200
        for data_type, csv_data in imports:
            response = client.post("/imports", headers=headers, params={"data_type": data_type},
                                   files={"file": (f"{data_type}.csv", csv_data, "text/csv")})
            assert response.status_code == 200, response.text
            assert response.json()["imported_rows"] == 1, response.json()
        profile = client.get("/students/S701", headers=headers).json()
        assert len(profile["observations"]) == 8  # subject marks and backlog are distinct measures
        assert {item["category"] for item in profile["observations"]} == {
            "academic", "attendance", "lms", "engagement", "placement", "skills", "feedback"
        }
        subject_marks = next(item for item in profile["observations"] if item["metric"] == "marks")
        assert subject_marks["synthetic"] == 1
        analytics = client.get("/analytics/observations", headers=headers).json()
        assert analytics["total_records"] == 8
        attendance = client.get("/analytics/observations?category=attendance", headers=headers).json()
        assert attendance["trends"][0]["average"] == 80
        observation_report = client.get("/reports/observations.csv", headers=headers)
        assert observation_report.status_code == 200
        assert "S701" in observation_report.text and "attendance" in observation_report.text
        history = client.get("/imports", headers=headers).json()
        assert any(item["data_type"] == "attendance-history" for item in history)
        assert client.get("/analytics/observations", headers={"Authorization": "Bearer viewer-token"}).status_code == 200
        assert client.get("/reports/observations.csv", headers={"Authorization": "Bearer viewer-token"}).status_code == 403


def test_structured_import_rejects_bad_rows_duplicates_and_unknown_students(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "observation_validation.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    csv_data = (b"student_id,date,attended,held\n"
                b"S801,2026-09-01,5,4\n"
                b"S999,2026-09-01,2,4\n"
                b"S801,not-a-date,2,4\n"
                b"S801,2026-09-03,2.5,4\n")
    with TestClient(main.app) as client:
        client.post("/imports", headers=headers,
                    files={"file": ("students.csv", b"student_id,name\nS801,Demo\n", "text/csv")})
        response = client.post("/imports", headers=headers, params={"data_type": "attendance-history"},
                               files={"file": ("attendance.csv", csv_data, "text/csv")})
        data = response.json()
        assert response.status_code == 200
        assert data["imported_rows"] == 0
        assert data["error_count"] == 4
        assert "attended cannot exceed held" in data["errors"][0]["message"]
        assert "Unknown student_id" in data["errors"][1]["message"]
        assert "Date" in data["errors"][2]["message"] or "date" in data["errors"][2]["message"]
        assert "whole number" in data["errors"][3]["message"]
        assert client.get("/students/S801", headers=headers).json()["observations"] == []


def test_structured_import_duplicate_and_missing_value_handling(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "observation_duplicates.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    csv_data = (b"student_id,date,assessment_type,score\n"
                b"S811,2026-09-01,coding,76\n"
                b"S811,2026-09-01,coding,76\n"
                b"S811,2026-09-02,aptitude,\n")
    with TestClient(main.app) as client:
        client.post("/imports", headers=headers,
                    files={"file": ("students.csv", b"student_id,name\nS811,Demo\n", "text/csv")})
        response = client.post("/imports", headers=headers, params={"data_type": "placement-assessment"},
                               files={"file": ("placement.csv", csv_data, "text/csv")})
        result = response.json()
        assert response.status_code == 200
        assert result["imported_rows"] == 1
        assert result["error_count"] == 2
        assert "Duplicate observation" in result["errors"][0]["message"]
        assert "score is required" in result["errors"][1]["message"]
        observations = client.get("/students/S811", headers=headers).json()["observations"]
        assert len(observations) == 1
        assert observations[0]["value"] == 76


def test_intervention_rejects_blank_description_and_invalid_dates(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "intervention_validation.db")
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"staff-token": "staff"}))
    headers = {"Authorization": "Bearer staff-token"}
    with TestClient(main.app) as client:
        imported = client.post("/imports", headers=headers,
                               files={"file": ("students.csv", b"student_id,name\nS901,Student\n", "text/csv")})
        assert imported.status_code == 200
        blank = client.post("/interventions", headers=headers,
                            json={"student_id": "S901", "description": "   "})
        assert blank.status_code == 422
        bad_date = client.post("/interventions", headers=headers,
                               json={"student_id": "S901", "description": "Check in", "follow_up_date": "next week"})
        assert bad_date.status_code == 422
        created = client.post("/interventions", headers=headers,
                              json={"student_id": "S901", "description": " Check in ", "follow_up_date": "2026-10-25"})
        assert created.status_code == 200
        assert created.json()["description"] == "Check in"
        updated = client.patch(f"/interventions/{created.json()['id']}", headers=headers,
                               json={"follow_up_date": "2026-02-31"})
        assert updated.status_code == 422


def test_database_migration_adds_observation_table_and_actor_column(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "old_schema.db")
    with database.connect() as db:
        db.executescript("""
        CREATE TABLE students(student_id TEXT PRIMARY KEY, department TEXT, semester TEXT, cohort TEXT, payload TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE imports(id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, total_rows INTEGER NOT NULL, imported_rows INTEGER NOT NULL, errors TEXT NOT NULL);
        CREATE TABLE interventions(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open', owner TEXT, follow_up_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE intervention_history(id INTEGER PRIMARY KEY AUTOINCREMENT, intervention_id INTEGER NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, owner TEXT, follow_up_date TEXT, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        """)
        db.execute("INSERT INTO students(student_id,payload,source) VALUES(?,?,?)", ("KEEP-1", json.dumps({"name": "Existing"}), "legacy.csv"))
    database.initialize()
    with database.connect() as db:
        history_cols = {row["name"] for row in db.execute("PRAGMA table_info(intervention_history)")}
        observation_cols = {row["name"] for row in db.execute("PRAGMA table_info(student_observations)")}
        assert "actor" in history_cols
        assert "data_type" in {row["name"] for row in db.execute("PRAGMA table_info(imports)")}
        assert {"student_id", "category", "observed_at", "metric", "value", "source"} <= observation_cols
        assert json.loads(db.execute("SELECT payload FROM students WHERE student_id='KEEP-1'").fetchone()[0])["name"] == "Existing"
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2


def test_guest_demo_sandbox_supports_scoped_workflows_and_preserves_operational_data(tmp_path, monkeypatch):
    assert not main._has_demo_provenance("REAL_DEMO")
    assert not main._has_demo_provenance("NOT_SYNTHETIC")
    operational_path = tmp_path / "operational.db"
    demo_path = tmp_path / "demo.db"
    monkeypatch.setattr(database, "DB_PATH", operational_path)
    monkeypatch.setenv("CAMPUS_DEMO_DB_PATH", str(demo_path))
    monkeypatch.setenv("CAMPUS_API_KEYS", json.dumps({"viewer-token": "viewer", "staff-token": "staff"}))
    database.initialize()
    database.save_student("REAL-1", {"name": "Institutional Record", "data_origin": "INSTITUTIONAL"}, "registrar_roster.csv")
    database.save_student("UNKNOWN-1", {"name": "Unverified Record"}, "legacy_import.csv")

    with TestClient(main.app) as client:
        before_users = len(database.list_users())
        institutional_action = client.post("/interventions", headers={"Authorization": "Bearer staff-token"},
            json={"student_id": "REAL-1", "description": "Operational follow-up"})
        assert institutional_action.status_code == 200
        created = client.post("/auth/guest-session")
        assert created.status_code == 200
        assert created.json()["expires_in"] == 1800
        assert created.json()["user"]["role"] == "guest"
        assert len(database.list_users()) == before_users
        headers = {"Authorization": f"Bearer {created.json()['access_token']}"}
        assert client.get("/session", headers=headers).json()["auth_type"] == "guest"

        overview = client.get("/overview", headers=headers)
        assert overview.status_code == 200
        assert overview.json()["student_count"] > 0
        assert client.get("/students/REAL-1", headers=headers).status_code == 404
        assert client.get("/students/UNKNOWN-1", headers=headers).status_code == 404
        students = client.get("/students?page=1&page_size=200", headers=headers).json()
        assert students["total"] == overview.json()["student_count"]
        assert all("synthetic" in str(row["data"].get("data_origin", "")).lower() for row in students["items"])
        student_id = students["items"][0]["student_id"]
        assert client.get("/model/status", headers=headers).status_code == 200
        assert client.post("/predict", headers=headers, json={"study_hours": 1, "attendance": 1}).status_code in {200, 503}
        assert all(client.get(path, headers=headers).status_code == 200 for path in (
            "/reports/students.csv", "/reports/students.xlsx", "/reports/summary.pdf", "/reports/observations.csv"))
        assert b"REAL-1" not in client.get("/reports/students.csv", headers=headers).content
        assert client.get("/interventions", headers=headers).json() == []
        assert client.patch(f"/interventions/{institutional_action.json()['id']}", headers=headers,
            json={"status": "Completed"}).status_code == 404

        no_confirmation = client.post("/imports", headers=headers,
            files={"file": ("no-confirm.csv", b"student_id,data_origin\nGUEST-1,SYNTHETIC\n", "text/csv")})
        assert no_confirmation.status_code == 422
        missing_origin = client.post("/imports?synthetic_confirmed=true", headers=headers,
            files={"file": ("missing-origin.csv", b"student_id,name\nGUEST-1,Unverified\n", "text/csv")})
        assert missing_origin.status_code == 200
        assert missing_origin.json()["imported_rows"] == 0

        imported = client.post("/imports?synthetic_confirmed=true", headers=headers,
            files={"file": ("demo.csv", b"student_id,name,data_origin\nGUEST-1,Demo Learner,SYNTHETIC_TEST\n", "text/csv")})
        assert imported.status_code == 200 and imported.json()["imported_rows"] == 1
        assert client.get("/students/GUEST-1", headers=headers).json()["data"]["data_origin"] == "SYNTHETIC_GUEST_IMPORT"
        observation = client.post("/imports?data_type=subject-performance&synthetic_confirmed=true", headers=headers,
            files={"file": ("demo-observation.csv", b"student_id,subject,marks,data_origin\nGUEST-1,Math,83,SYNTHETIC_DEMO\n", "text/csv")})
        assert observation.status_code == 200 and observation.json()["imported_rows"] == 1
        assert client.get("/analytics/observations", headers=headers).json()["total_records"] == 1
        intervention = client.post("/interventions", headers=headers,
            json={"student_id": student_id, "description": "Sandbox tutoring support"})
        assert intervention.status_code == 200
        intervention_id = intervention.json()["id"]
        assert client.patch(f"/interventions/{intervention_id}", headers=headers,
            json={"status": "In Progress"}).json()["status"] == "In Progress"
        assert client.get(f"/interventions/{intervention_id}/history", headers=headers).json()[-1]["action"] == "updated"
        assert client.get(f"/students/{student_id}", headers=headers).json()["interventions"][0]["id"] == intervention_id
        assert client.get("/imports", headers=headers).json()[0]["source"].startswith("SYNTHETIC_GUEST_IMPORT:")

        # The guest import/intervention remain absent from the operational database.
        assert "GUEST-1" not in {item["student_id"] for item in client.get("/students?page=1&page_size=200", headers={"Authorization": "Bearer staff-token"}).json()["items"]}
        assert "REAL-1" in {item["student_id"] for item in client.get("/students", headers={"Authorization": "Bearer staff-token"}).json()}
        with database.connect(demo_path) as db:
            assert db.execute("SELECT COUNT(*) FROM interventions").fetchone()[0] == 1
        with database.connect(operational_path) as db:
            assert db.execute("SELECT COUNT(*) FROM interventions").fetchone()[0] == 1
            assert db.execute("SELECT status FROM interventions WHERE id=?", (institutional_action.json()["id"],)).fetchone()[0] == "Open"

        restored = client.post("/demo/reset", headers=headers, json={"confirm": "RESTORE_DEMO"})
        assert restored.status_code == 200
        assert client.get("/students/GUEST-1", headers=headers).status_code == 404
        assert client.get("/interventions", headers=headers).json() == []
        viewer = {"Authorization": "Bearer viewer-token"}
        assert client.get("/overview", headers=viewer).status_code == 200
        assert client.get("/students", headers=viewer).status_code == 403
        assert client.get("/at-risk", headers=viewer).status_code == 403
        assert client.post("/users", headers=headers, json={"role": "admin"}).status_code == 404
        assert client.post("/auth/logout", headers=headers).status_code == 200
        assert client.get("/overview", headers=headers).status_code == 401
