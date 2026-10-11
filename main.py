"""FastAPI application for student records, imports, scores, analytics, and authentication."""
import io
import json
import math
import os
import hmac
import secrets
import threading
from datetime import date, datetime, timedelta, timezone
from collections import Counter
from contextlib import asynccontextmanager
from pathlib import Path

import jwt
import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from src.auth import (
    JWT_ALGORITHM,
    JWT_EXPIRE_MINUTES,
    JWT_SECRET,
    authenticate_user,
    bootstrap_accounts,
    create_access_token,
    decode_access_token,
    validate_runtime_auth_configuration,
)
from src.database import (
    connect,
    initialize,
    initialize_demo,
    list_observations,
    list_imports,
    list_students,
    record_import,
    save_student,
    set_demo_workspace,
    reset_demo_workspace,
    in_demo_workspace,
)
from src.success_score import calculate_success_score

bearer = HTTPBearer(auto_error=False)
_revoked_guest_sessions: dict[str, int] = {}
_guest_revocation_lock = threading.Lock()


def _guest_session_is_revoked(payload: dict) -> bool:
    token_id = payload.get("jti")
    if not token_id:
        return True
    now = int(datetime.now(timezone.utc).timestamp())
    with _guest_revocation_lock:
        expired = [key for key, expires_at in _revoked_guest_sessions.items() if expires_at <= now]
        for key in expired:
            _revoked_guest_sessions.pop(key, None)
        return token_id in _revoked_guest_sessions


def authenticate(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Authenticate request using signed JWT session token or backward-compatible API token."""
    if credentials is None:
        raise HTTPException(401, "Valid bearer token required")
    token_str = credentials.credentials.strip()

    # 1. Check for signed JWT session token
    try:
        payload = decode_access_token(token_str)
        role = payload.get("role")
        if (
            role == "guest"
            and payload.get("type") == "guest_session"
            and payload.get("auth_type") == "guest"
            and payload.get("sub") == "guest-demo"
        ):
            if _guest_session_is_revoked(payload):
                raise HTTPException(401, "Guest demo session has ended. Start a new guest session to continue.")
            return "guest"
        if role in ("viewer", "analyst", "staff", "admin") and payload.get("type") == "user_session":
            return role
        raise HTTPException(401, "Invalid token role claim")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "Authentication session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError:
        # Not a valid JWT; fall through to check API token for backward compatibility
        pass

    # 2. Check backward-compatible API token (CAMPUS_API_KEYS)
    try:
        configured = json.loads(os.getenv("CAMPUS_API_KEYS", "{}"))
    except json.JSONDecodeError:
        configured = {}
    if isinstance(configured, dict):
        role = next((value for token, value in configured.items() if hmac.compare_digest(token, token_str)), None)
        if role in ("viewer", "analyst", "staff", "admin"):
            return role

    raise HTTPException(401, "Invalid bearer token or session credentials")


def require_roles(*allowed):
    def check(role=Depends(authenticate)):
        if role not in allowed:
            raise HTTPException(403, "Your role cannot perform this action")
        return role
    return check


def dump_model(model: BaseModel, **kwargs):
    if hasattr(model, "model_dump"):
        return model.model_dump(**kwargs)
    return model.dict(**kwargs)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_auth_configuration()
    initialize()
    initialize_demo(_bundled_demo_students())
    bootstrap_accounts(allow_dev_defaults=os.getenv("CAMPUS_AUTH_MODE", "local").strip().lower() != "firebase")
    yield


def _has_demo_provenance(value) -> bool:
    normalized = str(value or "").strip().lower()
    phrase = " ".join(normalized.replace("_", " ").replace("-", " ").replace(".", " ").split())
    words = set(phrase.split())
    if not phrase or words & {"real", "institutional", "production", "unknown", "unspecified", "unverified"} or any(marker in phrase for marker in ("not synthetic", "non synthetic", "nonsynthetic", "not demo", "non demo")):
        return False
    return bool(words & {"synthetic", "demo", "development"}) or "dev_campus" in normalized


def _is_explicit_demo_student(record: dict) -> bool:
    data = record.get("data") or {}
    origin = str(data.get("data_origin") or "").strip()
    source = str(record.get("source") or "").strip()
    supplied = [value for value in (origin, source) if value]
    # When both provenance fields exist, require both to identify demo data.
    return bool(supplied) and all(_has_demo_provenance(value) for value in supplied)


def _bundled_demo_students() -> list[dict]:
    """Read only the explicitly labelled bundled demo CSV; never persist fallback rows."""
    path = Path(__file__).resolve().parent / "data" / "dev_campus_students.csv"
    if not path.is_file():
        return []
    try:
        frame = pd.read_csv(path)
    except Exception:
        return []
    records = []
    for raw in frame.to_dict(orient="records"):
        data = {}
        for key, value in raw.items():
            if pd.isna(value):
                data[key] = None
            elif hasattr(value, "item"):
                data[key] = value.item()
            else:
                data[key] = value
        record = {
            "student_id": str(data.get("student_id") or ""),
            "department": data.get("department"),
            "semester": str(data["semester"]) if data.get("semester") is not None else None,
            "cohort": data.get("cohort"),
            "data": data,
            "source": path.name,
            "updated_at": None,
        }
        if record["student_id"] and _is_explicit_demo_student(record):
            records.append(record)
    return records


def _guest_students() -> list[dict]:
    token = None if in_demo_workspace() else set_demo_workspace(True)
    try:
        records = [record for record in list_students() if _is_explicit_demo_student(record)]
    finally:
        if token is not None:
            reset_demo_workspace(token)
    if not records:
        raise HTTPException(
            503,
            "No explicitly labelled synthetic demo records are available. Restore data/dev_campus_students.csv or import records with synthetic/demo provenance.",
        )
    return records


def _students_for_role(role: str) -> list[dict]:
    return _guest_students() if role == "guest" else list_students()


def _observations_for_role(role: str):
    records = list_observations()
    if role != "guest":
        return records
    allowed_ids = {record["student_id"] for record in _guest_students()}
    return [record for record in records if record.get("synthetic") == 1 and record.get("student_id") in allowed_ids]


app = FastAPI(
    title="CampusLuma API",
    version="0.3.0",
    lifespan=lifespan,
)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:8501",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:8501",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
)


def configured_cors_origins() -> list[str]:
    configured = os.getenv("CAMPUS_CORS_ORIGINS", "")
    deployment_origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    origins = deployment_origins or list(DEFAULT_CORS_ORIGINS)
    return list(dict.fromkeys(origins))


app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def isolate_guest_workspace(request, call_next):
    """Route verified guest JWT requests to a separate SQLite file for the full request."""
    authorization = request.headers.get("authorization", "")
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    workspace_token = None
    if token:
        try:
            payload = decode_access_token(token)
            if (payload.get("role") == "guest" and payload.get("type") == "guest_session"
                    and payload.get("auth_type") == "guest" and payload.get("sub") == "guest-demo"):
                workspace_token = set_demo_workspace(True)
        except jwt.InvalidTokenError:
            pass
    try:
        return await call_next(request)
    finally:
        if workspace_token is not None:
            reset_demo_workspace(workspace_token)


class LoginRequest(BaseModel):
    email: str
    password: str


class FirebaseLoginRequest(BaseModel):
    id_token: str = Field(min_length=20)


class PredictionInput(BaseModel):
    study_hours: float | None = Field(None, ge=0, le=24)
    attendance: float | None = Field(None, ge=0, le=100)
    assignments: float | None = Field(None, ge=0, le=100)
    quizzes: float | None = Field(None, ge=0, le=100)


class InterventionInput(BaseModel):
    student_id: str
    description: str
    owner: str | None = None
    follow_up_date: str | None = None


class InterventionUpdate(BaseModel):
    status: str | None = None
    owner: str | None = None
    follow_up_date: str | None = None


class DemoResetRequest(BaseModel):
    confirm: str


# --- Public Endpoints ---

@app.get("/")
def home():
    return {"message": "CampusLuma API", "docs": "/docs"}


@app.post("/auth/login")
def login(body: LoginRequest):
    """Authenticate user with email and password and return a signed JWT access token."""
    if os.getenv("CAMPUS_AUTH_MODE", "local").strip().lower() == "firebase":
        raise HTTPException(404, "Local password sign-in is disabled. Sign in through Firebase Authentication.")
    user = authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")

    access_token = create_access_token(
        user_email=user["email"],
        user_name=user["name"],
        role=user["role"],
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_MINUTES * 60,
        "user": {
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


def _firebase_admin_app():
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise HTTPException(503, "Firebase authentication is enabled but FIREBASE_PROJECT_ID is not configured on the backend.")
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:
        raise HTTPException(503, "Firebase Admin SDK is unavailable. Install backend requirements before enabling Firebase authentication.") from exc

    try:
        return firebase_admin.get_app("student-iq")
    except ValueError:
        pass

    service_account_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    try:
        credential = credentials.Certificate(service_account_path) if service_account_path else credentials.ApplicationDefault()
        return firebase_admin.initialize_app(
            credential, options={"projectId": project_id}, name="student-iq",
        )
    except Exception as exc:
        raise HTTPException(503, "Firebase Admin credentials could not be initialized. Configure GOOGLE_APPLICATION_CREDENTIALS or application-default credentials.") from exc


@app.post("/auth/firebase")
def firebase_login(body: FirebaseLoginRequest):
    """Verify a Firebase ID token and provision new verified identities as viewers."""
    if os.getenv("CAMPUS_AUTH_MODE", "local").strip().lower() != "firebase":
        raise HTTPException(404, "Firebase authentication is disabled. Set CAMPUS_AUTH_MODE=firebase to enable it.")

    app_instance = _firebase_admin_app()
    try:
        from firebase_admin import auth as firebase_auth
        claims = firebase_auth.verify_id_token(body.id_token, app=app_instance, check_revoked=True)
    except Exception as exc:
        if type(exc).__name__ in {"CertificateFetchError", "UnexpectedResponseError", "TransportError"}:
            raise HTTPException(503, "Firebase token verification is temporarily unavailable. Retry sign-in.") from exc
        raise HTTPException(401, "Firebase sign-in token is invalid, expired, or revoked. Sign in again.") from exc

    email = str(claims.get("email") or "").strip().lower()
    if not email or not claims.get("email_verified"):
        raise HTTPException(403, "Verify your email address with Firebase before accessing CampusLuma.")

    from src.auth import VALID_ROLES
    from src.database import ensure_firebase_viewer
    display_name = str(claims.get("name") or "").strip()
    user = ensure_firebase_viewer(email, display_name)
    if not user.get("is_active", 1):
        raise HTTPException(403, "This CampusLuma account is disabled. Contact an administrator.")
    if user.get("role") not in VALID_ROLES:
        raise HTTPException(403, "This CampusLuma account has an invalid role assignment.")

    access_token = create_access_token(
        user_email=user["email"], user_name=user["name"], role=user["role"], identity_provider="firebase",
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_MINUTES * 60,
        "user": {"email": user["email"], "name": user["name"], "role": user["role"]},
    }


@app.post("/auth/guest-session")
def create_guest_session():
    """Issue a short-lived session after confirming an isolated synthetic sandbox exists."""
    _guest_students()
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "guest-demo",
            "name": "Guest Demo",
            "role": "guest",
            "type": "guest_session",
            "auth_type": "guest",
            "jti": secrets.token_urlsafe(18),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=30)).timestamp()),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 1800,
        "user": {"email": None, "name": "Guest Demo", "role": "guest"},
    }


@app.post("/demo/reset")
def reset_demo_workspace_endpoint(body: DemoResetRequest,
                                  role: str = Depends(require_roles("guest"))):
    if body.confirm != "RESTORE_DEMO":
        raise HTTPException(422, "Confirm the sandbox restore by sending confirm=RESTORE_DEMO.")
    initialize_demo(_bundled_demo_students(), reset=True)
    return {"message": "Guest demo workspace restored to the bundled synthetic starting dataset.",
            "student_count": len(_guest_students())}


@app.post("/auth/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Clear a guest token server-side when possible; ordinary sessions retain existing logout behavior."""
    if credentials is not None:
        try:
            payload = decode_access_token(credentials.credentials.strip())
        except jwt.InvalidTokenError:
            payload = {}
        if (
            payload.get("role") == "guest"
            and payload.get("type") == "guest_session"
            and payload.get("auth_type") == "guest"
            and payload.get("sub") == "guest-demo"
            and payload.get("jti")
        ):
            now = int(datetime.now(timezone.utc).timestamp())
            expires_at = int(payload.get("exp") or now)
            if expires_at > now:
                with _guest_revocation_lock:
                    _revoked_guest_sessions[payload["jti"]] = expires_at
    return {"message": "Logged out successfully"}


# --- Authenticated Session & Status Endpoints ---

@app.get("/session")
def session(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Return active session information and verified user role."""
    if credentials is None:
        raise HTTPException(401, "Valid bearer token required")
    token_str = credentials.credentials.strip()

    # 1. JWT verification
    try:
        payload = decode_access_token(token_str)
        role = payload.get("role")
        if (
            role == "guest"
            and payload.get("type") == "guest_session"
            and payload.get("auth_type") == "guest"
            and payload.get("sub") == "guest-demo"
        ):
            if _guest_session_is_revoked(payload):
                raise HTTPException(401, "Guest demo session has ended. Start a new guest session to continue.")
            return {"role": "guest", "email": None, "name": "Guest Demo", "auth_type": "guest"}
        if role in ("viewer", "analyst", "staff", "admin"):
            return {
                "role": role,
                "email": payload.get("sub"),
                "name": payload.get("name"),
                "auth_type": "user_session",
                "identity_provider": payload.get("identity_provider", "local"),
            }
        raise HTTPException(401, "Invalid token role claim")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "Authentication session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError:
        pass

    # 2. API key check (backward-compatible)
    try:
        configured = json.loads(os.getenv("CAMPUS_API_KEYS", "{}"))
    except json.JSONDecodeError:
        configured = {}
    if isinstance(configured, dict):
        role = next((value for token, value in configured.items() if hmac.compare_digest(token, token_str)), None)
        if role in ("viewer", "analyst", "staff", "admin"):
            return {
                "role": role,
                "email": None,
                "name": f"API Token ({role})",
                "auth_type": "api_token",
            }

    raise HTTPException(401, "Invalid bearer token or session credentials")


@app.get("/auth/me")
def auth_me(session_data=Depends(session)):
    return session_data


@app.get("/model/status")
def model_status(role: str = Depends(require_roles("viewer", "analyst", "staff", "admin", "guest"))):
    from src.preprocess import MODEL_PATH
    metrics_path = MODEL_PATH.parent / "metrics.json"
    if not MODEL_PATH.exists():
        return {
            "status": "not_trained",
            "metrics": None,
            "artifact_path": None if role == "guest" else str(MODEL_PATH),
            "experimental": True,
            "note": "Demo only. Its target is generated by data/generate_data.py from study hours, attendance, assignments, and quizzes; no validated institutional outcome labels are available.",
        }
    metrics = None
    if metrics_path.exists():
        try:
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "status": "trained",
        "metrics": metrics,
        "artifact_path": None if role == "guest" else str(MODEL_PATH),
        "experimental": True,
        "note": "Demo only. Its pass target is generated from the same four input features (study hours, attendance, assignments, and quizzes); held-out metrics measure synthetic-label agreement, not student outcome prediction.",
    }


@app.post("/predict")
def predict(body: PredictionInput, role: str = Depends(require_roles("viewer", "analyst", "staff", "admin", "guest"))):
    from src.predict import predict_student
    try:
        return predict_student(dump_model(body, exclude_none=True))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/overview")
def overview(role: str = Depends(authenticate)):
    records = _students_for_role(role)
    scores = [calculate_success_score(r["data"]) for r in records]
    covered = [s for s in scores if s["reliable"] and s["score"] is not None]
    categories = Counter()
    for score in scores:
        for name, value in score["category_scores"].items():
            if value is not None:
                categories[name] += 1
    attendance = [r["data"].get("attendance") for r in records if r["data"].get("attendance") is not None]
    placement_names = ("aptitude", "coding_assessment", "mock_interview")
    placement = [float(r["data"][k]) for r in records for k in placement_names if r["data"].get(k) is not None]
    risk = Counter("High Risk" if s["score"] < 40 else "Medium Risk" if s["score"] < 65 else "Low Risk" for s in covered)
    score_distribution = Counter()
    for score in covered:
        lower = min(80, int(score["score"] // 20) * 20)
        score_distribution[f"{lower}–{lower + 20}"] += 1
    return {"student_count": len(records), "scored_students": len(covered),
            "insufficient_data": len(records) - len(covered), "average_success_score": round(sum(s["score"] for s in covered)/len(covered), 1) if covered else None,
            "risk_distribution": dict(risk), "average_attendance": round(sum(float(x) for x in attendance)/len(attendance), 1) if attendance else None,
            "average_placement_readiness": round(sum(placement)/len(placement), 1) if placement else None,
            "category_coverage": dict(categories), "success_score_distribution": dict(score_distribution),
            "score_method": "Prototype, unvalidated policy weights; data coverage is required before an overall score is shown."}


@app.get("/overview/departments")
def overview_departments(role: str = Depends(authenticate)):
    records = _students_for_role(role)
    by_dept = {}
    for r in records:
        dept = r.get("department") or "Unspecified"
        by_dept.setdefault(dept, []).append(r)
    results = []
    for dept, items in sorted(by_dept.items()):
        scores = [calculate_success_score(item["data"]) for item in items]
        covered = [s["score"] for s in scores if s["reliable"] and s["score"] is not None]
        attendances = [float(item["data"]["attendance"]) for item in items if item["data"].get("attendance") is not None]
        placements = [
            float(item["data"][k]) for item in items
            for k in ("aptitude", "coding_assessment", "mock_interview")
            if item["data"].get(k) is not None
        ]
        results.append({
            "department": dept,
            "student_count": len(items),
            "avg_success_score": round(sum(covered) / len(covered), 1) if covered else None,
            "avg_attendance": round(sum(attendances) / len(attendances), 1) if attendances else None,
            "avg_placement_readiness": round(sum(placements) / len(placements), 1) if placements else None,
        })
    return results


@app.get("/cohorts")
def cohort_analytics(role: str = Depends(authenticate)):
    grouped = {}
    for record in _students_for_role(role):
        key = (record.get("department") or "Unspecified", record.get("semester") or "Unspecified", record.get("cohort") or "Unspecified")
        score = calculate_success_score(record["data"])
        item = grouped.setdefault(key, {"students": 0, "scored": 0, "score_sum": 0.0})
        item["students"] += 1
        if score["reliable"] and score["score"] is not None:
            item["scored"] += 1
            item["score_sum"] += score["score"]
    return [{"department": k[0], "semester": k[1], "cohort": k[2], "students": v["students"], "scored_students": v["scored"],
             "average_success_score": round(v["score_sum"] / v["scored"], 1) if v["scored"] else None} for k, v in grouped.items()]


@app.get("/analytics/observations")
def observation_analytics(category: str | None = None, role: str = Depends(authenticate)):
    """Summarize structured records; dates and values come only from stored observations."""
    categories = {item[0] for item in OBSERVATION_IMPORTS.values()}
    if category and category not in categories:
        raise HTTPException(422, "Unsupported observation category")
    records = _observations_for_role(role)
    if category:
        records = [record for record in records if record["category"] == category]
    grouped, timeline = {}, {}
    for record in records:
        subject = record["subject"]
        term_value = record["details"].get("term")
        term = str(term_value).strip() if term_value is not None else None
        key = (record["category"], record["metric"], subject, term)
        group = grouped.setdefault(key, {"count": 0, "sum": 0.0, "valued_count": 0, "students": set()})
        group["count"] += 1
        group["students"].add(record["student_id"])
        if record["value"] is not None:
            group["sum"] += float(record["value"])
            group["valued_count"] += 1
            if record["observed_at"]:
                day_key = (*key, record["observed_at"])
                day = timeline.setdefault(day_key, {"count": 0, "sum": 0.0})
                day["count"] += 1
                day["sum"] += float(record["value"])
    summaries = [{"category": key[0], "metric": key[1], "subject": key[2], "term": key[3], "records": val["count"], "students": len(val["students"]),
                  "valued_records": val["valued_count"], "average": round(val["sum"] / val["valued_count"], 2) if val["valued_count"] else None}
                 for key, val in sorted(grouped.items(), key=lambda item: tuple(str(part or "") for part in item[0]))]
    trends = [{"category": key[0], "metric": key[1], "subject": key[2], "term": key[3], "date": key[4], "records": val["count"],
               "average": round(val["sum"] / val["count"], 2)}
              for key, val in sorted(timeline.items(), key=lambda item: tuple(str(part or "") for part in item[0]))]
    return {"category": category, "total_records": len(records), "summaries": summaries, "trends": trends,
            "data_note": "Summaries use stored imported records only. Missing dates and measurements are excluded, not treated as zero."}


# --- Staff & Admin Restricted Endpoints ---

@app.get("/students/departments")
def student_departments(role: str = Depends(require_roles("staff", "admin", "guest"))):
    records = _students_for_role(role)
    depts = sorted(list({r.get("department") for r in records if r.get("department")}))
    return depts


@app.get("/students")
def students(
    search: str | None = None,
    department: str | None = None,
    semester: str | None = None,
    cohort: str | None = None,
    risk_level: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    role: str = Depends(require_roles("staff", "admin", "guest")),
):
    records = _students_for_role(role)
    if search:
        records = [r for r in records if search.lower() in r["student_id"].lower() or search.lower() in str(r["data"].get("name", "")).lower()]
    if department:
        records = [r for r in records if r.get("department") == department]
    if semester:
        records = [r for r in records if str(r.get("semester")) == str(semester)]
    if cohort:
        records = [r for r in records if str(r.get("cohort") or r["data"].get("cohort") or "") == cohort]

    scored = [r | {"success_score": calculate_success_score(r["data"])} for r in records]
    if risk_level:
        if risk_level not in {"High Risk", "Medium Risk", "Low Risk", "Unknown"}:
            raise HTTPException(422, "risk_level must be High Risk, Medium Risk, Low Risk, or Unknown")
        def matches_risk(item):
            score = item["success_score"]
            if not score["reliable"] or score["score"] is None:
                return risk_level == "Unknown"
            tier = "High Risk" if score["score"] < 40 else "Medium Risk" if score["score"] < 65 else "Low Risk"
            return tier == risk_level
        scored = [item for item in scored if matches_risk(item)]

    if page is not None:
        p = max(1, page)
        ps = max(1, min(200, page_size or 50))
        total = len(scored)
        pages = max(1, (total + ps - 1) // ps)
        start = (p - 1) * ps
        return {
            "items": scored[start : start + ps],
            "total": total,
            "page": p,
            "page_size": ps,
            "pages": pages,
        }
    return scored


@app.get("/students/{student_id}")
def student_profile(student_id: str, role: str = Depends(require_roles("staff", "admin", "guest"))):
    found = next((r for r in _students_for_role(role) if r["student_id"] == student_id), None)
    if not found:
        raise HTTPException(404, "Student not found")
    with connect() as db:
        student_interventions = [dict(r) for r in db.execute("SELECT * FROM interventions WHERE student_id=? ORDER BY created_at DESC", (student_id,))]
    observations = list_observations(student_id=student_id)
    if role == "guest":
        observations = [record for record in observations if record.get("synthetic") == 1]
    return found | {"success_score": calculate_success_score(found["data"]), "interventions": student_interventions,
                    "observations": observations}


@app.post("/imports")
async def import_students(file: UploadFile = File(...), mapping: str | None = Query(None, description="JSON map of canonical field to source column"),
                         data_type: str = Query("students", description="students or a structured observation category"),
                         synthetic_confirmed: bool = Query(False),
                         role: str = Depends(require_roles("staff", "admin", "guest"))):
    if role == "guest" and not synthetic_confirmed:
        raise HTTPException(422, "Confirm that every uploaded record is synthetic demo data before importing to the sandbox.")
    suffix = (file.filename or "").lower().rsplit(".", 1)[-1]
    if suffix not in {"csv", "xlsx", "xls"}:
        raise HTTPException(415, "Upload a CSV or Excel workbook")
    raw = await file.read()
    try:
        frame = pd.read_csv(io.BytesIO(raw)) if suffix == "csv" else pd.read_excel(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(400, f"Could not read uploaded file: {exc}") from exc
    if frame.empty:
        raise HTTPException(422, "The uploaded file has no records")
    try:
        aliases = json.loads(mapping) if mapping else {}
        if not isinstance(aliases, dict):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(422, "mapping must be a JSON object") from exc
    source = f"SYNTHETIC_GUEST_IMPORT:{file.filename or 'upload'}" if role == "guest" else (file.filename or "upload")
    if data_type != "students":
        if role == "guest" and "data_origin" not in frame.columns and "data_origin" not in aliases:
            raise HTTPException(422, "Guest imports require a data_origin column explicitly labelled synthetic or demo.")
        return import_observations(frame, aliases, data_type, source, guest=role == "guest")
    allowed = {"student_id", "name", "data_origin", "department", "semester", "cohort", "study_hours", "attendance", "assignments", "quizzes",
               "cgpa", "marks", "backlogs", "subject_performance", "subject_attendance", "lms_logins", "assignment_completion",
               "learning_activity", "clubs", "events", "hackathons", "certifications", "aptitude", "coding_assessment",
               "mock_interview", "technical_skills", "soft_skills", "student_satisfaction", "faculty_feedback"}
    if any(not isinstance(field, str) or field not in allowed or not isinstance(source, str) for field, source in aliases.items()):
        raise HTTPException(422, "mapping keys must be supported canonical fields and values must be source column names")
    if len(set(aliases.values())) != len(aliases):
        raise HTTPException(422, "Each source column can map to only one canonical field")
    missing_sources = [source for source in aliases.values() if source not in frame.columns]
    if missing_sources:
        raise HTTPException(422, f"Mapped source column(s) not found: {', '.join(missing_sources)}")
    frame = frame.rename(columns={source: canonical for canonical, source in aliases.items()})
    if frame.columns.duplicated().any():
        raise HTTPException(422, "Column mapping creates duplicate canonical columns")
    if "student_id" not in frame.columns:
        raise HTTPException(422, "A student_id column is required; supply a column mapping if needed")
    seen, errors, count = set(), [], 0
    ignored_columns = sorted(str(column) for column in frame.columns if str(column) not in allowed)
    bounds = {"study_hours": (0, 24), "attendance": (0, 100), "assignments": (0, 100), "quizzes": (0, 100),
              "cgpa": (0, 10), "backlogs": (0, 100), "marks": (0, 100), "subject_performance": (0, 100),
              "subject_attendance": (0, 100), "lms_logins": (0, 10), "assignment_completion": (0, 100),
              "learning_activity": (0, 10), "clubs": (0, 10), "events": (0, 10), "hackathons": (0, 10),
              "certifications": (0, 10), "aptitude": (0, 100), "coding_assessment": (0, 100),
              "mock_interview": (0, 100), "technical_skills": (0, 100), "soft_skills": (0, 100),
              "student_satisfaction": (0, 100), "faculty_feedback": (0, 100)}
    for index, row in frame.iterrows():
        line = int(index) + 2
        sid = row.get("student_id")
        if pd.isna(sid) or not str(sid).strip():
            errors.append({"row": line, "message": "student_id is missing"}); continue
        sid = str(sid).strip()
        if sid in seen:
            errors.append({"row": line, "student_id": sid, "message": "Duplicate student_id within uploaded file"}); continue
        data = {str(k): (None if pd.isna(v) else v.item() if hasattr(v, "item") else v) for k, v in row.items() if str(k) in allowed}
        if role == "guest":
            if not _has_demo_provenance(data.get("data_origin")):
                errors.append({"row": line, "student_id": sid, "message": "Guest imports require data_origin to be explicitly labelled synthetic or demo"}); continue
            with connect() as db:
                existing = db.execute("SELECT * FROM students WHERE student_id=?", (sid,)).fetchone()
            if existing:
                stored = dict(existing)
                try:
                    stored["data"] = json.loads(stored["payload"])
                except (TypeError, ValueError):
                    stored["data"] = {}
                if not _is_explicit_demo_student(stored):
                    errors.append({"row": line, "student_id": sid, "message": "This identifier already exists in the sandbox without verified synthetic provenance and cannot be overwritten"}); continue
            data["data_origin"] = "SYNTHETIC_GUEST_IMPORT"
        invalid = None
        for field, (low, high) in bounds.items():
            if data.get(field) is None:
                continue
            try:
                data[field] = float(data[field])
                if not low <= data[field] <= high:
                    invalid = f"{field} must be between {low} and {high}"; break
            except (TypeError, ValueError):
                invalid = f"{field} must be numeric"; break
        if invalid:
            errors.append({"row": line, "student_id": sid, "message": invalid}); continue
        seen.add(sid)
        save_student(sid, data, source)
        count += 1
    import_id = record_import(source, len(frame), count, errors)
    return {"import_id": import_id, "source": source, "total_rows": len(frame), "imported_rows": count,
            "error_count": len(errors), "errors": errors, "ignored_columns": ignored_columns}


OBSERVATION_IMPORTS = {
    "subject-performance": ("academic", {"student_id", "subject", "marks"}, {"marks": (0, 100), "backlogs": (0, 100)}),
    "attendance-history": ("attendance", {"student_id", "date", "attended", "held"}, {"attended": (0, 100000), "held": (1, 100000)}),
    "lms-activity": ("lms", {"student_id", "date", "event_type"}, {"completion_percent": (0, 100), "duration_minutes": (0, 100000)}),
    "engagement-activity": ("engagement", {"student_id", "date", "activity_type", "activity_name"}, {}),
    "placement-assessment": ("placement", {"student_id", "date", "assessment_type", "score"}, {"score": (0, 100)}),
    "skills-assessment": ("skills", {"student_id", "date", "skill_type", "skill_name", "score"}, {"score": (0, 100)}),
    "feedback": ("feedback", {"student_id", "date", "respondent_type", "score"}, {"score": (0, 100)}),
}


def import_observations(frame, aliases, data_type, source, guest=False):
    from src.database import connect, record_import, save_observation
    spec = OBSERVATION_IMPORTS.get(data_type)
    if spec is None:
        raise HTTPException(422, "Unsupported data_type")
    category, required, bounds = spec
    optional_by_type = {
        "subject-performance": {"term", "data_origin"},
        "attendance-history": {"subject", "data_origin"},
        "lms-activity": {"course", "data_origin"},
        "engagement-activity": {"data_origin"},
        "placement-assessment": {"data_origin"},
        "skills-assessment": {"data_origin"},
        "feedback": {"feedback_category", "data_origin"},
    }
    canonical = required | set(bounds) | optional_by_type[data_type]
    if guest and "data_origin" not in frame.columns and "data_origin" not in aliases:
        raise HTTPException(422, "Guest imports require a data_origin column explicitly labelled synthetic or demo.")
    if any(not isinstance(k, str) or k not in canonical or not isinstance(v, str) for k, v in aliases.items()):
        raise HTTPException(422, "mapping contains unsupported fields for this data type")
    if len(set(aliases.values())) != len(aliases):
        raise HTTPException(422, "Each source column can map to only one canonical field")
    absent = [v for v in aliases.values() if v not in frame.columns]
    if absent:
        raise HTTPException(422, f"Mapped source column(s) not found: {', '.join(absent)}")
    frame = frame.rename(columns={v: k for k, v in aliases.items()})
    if frame.columns.duplicated().any():
        raise HTTPException(422, "Column mapping creates duplicate canonical columns")
    missing = required - set(frame.columns)
    if missing:
        raise HTTPException(422, f"Required columns missing: {', '.join(sorted(missing))}")
    # Check headers before recording a batch; individual bad rows are reported and skipped.
    errors, accepted, seen = [], [], set()
    with connect() as db:
        known = {row[0] for row in db.execute("SELECT student_id FROM students")}
    if guest:
        known &= {record["student_id"] for record in _guest_students()}
    for index, row in frame.iterrows():
        line = int(index) + 2
        raw = {str(k): (None if pd.isna(v) else v.item() if hasattr(v, "item") else v) for k, v in row.items()}
        sid = str(raw.get("student_id") or "").strip()
        if guest and not _has_demo_provenance(raw.get("data_origin")):
            errors.append({"row": line, "student_id": sid or None, "message": "Guest imports require data_origin to be explicitly labelled synthetic or demo"}); continue
        if guest:
            raw["data_origin"] = "SYNTHETIC_GUEST_IMPORT"
        if not sid:
            errors.append({"row": line, "message": "student_id is missing"}); continue
        if sid not in known:
            errors.append({"row": line, "student_id": sid, "message": "Unknown student_id; import the student before importing observations"}); continue
        try:
            stamp = str(raw.get("date") or "").strip()
            if stamp:
                stamp = pd.to_datetime(stamp, errors="raise").date().isoformat()
            elif "date" in required:
                raise ValueError("date is required")
            values = {}
            for field, (low, high) in bounds.items():
                value = raw.get(field)
                if value is None or (isinstance(value, str) and not value.strip()):
                    if field in required:
                        raise ValueError(f"{field} is required")
                    continue
                number = float(value)
                if not math.isfinite(number) or not low <= number <= high:
                    raise ValueError(f"{field} must be between {low} and {high}")
                if field in {"backlogs", "attended", "held"} and not number.is_integer():
                    raise ValueError(f"{field} must be a whole number")
                values[field] = number
            for field in required - {"student_id", "date"}:
                value = raw.get(field)
                if value is None or not str(value).strip():
                    raise ValueError(f"{field} is required")
            record_type = {
                "subject-performance": "subject_assessment", "attendance-history": "attendance_session",
                "lms-activity": "lms_event", "engagement-activity": "participation",
            }.get(data_type)
            if data_type == "placement-assessment":
                record_type = str(raw["assessment_type"]).strip().lower()
            elif data_type == "skills-assessment":
                record_type = str(raw["skill_type"]).strip().lower()
            elif data_type == "feedback":
                record_type = str(raw["respondent_type"]).strip().lower()
            allowed = {"placement-assessment": {"aptitude", "coding", "mock_interview"},
                       "skills-assessment": {"technical", "soft"}, "feedback": {"student", "faculty"}}
            selector = {"placement-assessment": "assessment_type", "skills-assessment": "skill_type", "feedback": "respondent_type"}.get(data_type)
            if selector and record_type not in allowed[data_type]:
                raise ValueError(f"{selector} must be one of: {', '.join(sorted(allowed[data_type]))}")
            if data_type == "engagement-activity" and str(raw["activity_type"]).strip().lower() not in {"club", "event", "hackathon", "certification"}:
                raise ValueError("activity_type must be club, event, hackathon, or certification")
            if data_type == "attendance-history" and values["attended"] > values["held"]:
                raise ValueError("attended cannot exceed held")
            if data_type == "subject-performance":
                metric, value, subject = "marks", values["marks"], str(raw["subject"]).strip()
            elif data_type == "attendance-history":
                metric, value, subject = "attendance_percent", round(values["attended"] / values["held"] * 100, 2), raw.get("subject")
            elif data_type == "lms-activity":
                metric, value, subject = str(raw["event_type"]).strip().lower(), values.get("completion_percent"), raw.get("course")
            elif data_type == "engagement-activity":
                metric, value, subject = str(raw["activity_type"]).strip().lower(), None, raw.get("activity_name")
            elif data_type == "placement-assessment":
                metric, value, subject = "score", values["score"], record_type
            elif data_type == "skills-assessment":
                metric, value, subject = "score", values["score"], str(raw["skill_name"]).strip()
            else:
                metric, value, subject = "score", values["score"], str(raw.get("feedback_category") or "general").strip()
            subject = str(subject).strip() if subject is not None and str(subject).strip() else None
            details = {k: v for k, v in raw.items() if k not in {"student_id", "date"} and v not in (None, "")}
            signature = (sid, stamp, record_type, metric, subject, json.dumps(details, sort_keys=True, default=str))
            if signature in seen:
                raise ValueError("Duplicate observation within uploaded file")
            seen.add(signature)
            accepted.append((line, sid, category, record_type, stamp or None, subject, metric, value, details, values))
        except (TypeError, ValueError, OverflowError) as exc:
            errors.append({"row": line, "student_id": sid, "message": str(exc)}); continue
    import_id = record_import(source, len(frame), 0, [], data_type=data_type)
    saved, duplicate_errors = 0, []
    for values in accepted:
        line, sid, category, record_type, stamp, subject, metric, value, details, numeric_values = values
        with connect() as db:
            duplicate = db.execute("""SELECT 1 FROM student_observations WHERE student_id=? AND category=?
                AND record_type=? AND observed_at IS ? AND subject IS ? AND metric=? AND value IS ? AND details=? LIMIT 1""",
                (sid, category, record_type, stamp, subject, metric, value, json.dumps(details))).fetchone()
        if duplicate:
            errors.append({"row": line, "student_id": sid, "message": "Duplicate observation already exists; existing record preserved"})
            continue
        save_observation(student_id=sid, category=category, record_type=record_type, observed_at=stamp,
                         subject=subject, metric=metric, value=value, details=details, source=source, import_id=import_id,
                         synthetic=guest or _has_demo_provenance(details.get("data_origin")))
        if category == "academic" and numeric_values.get("backlogs") is not None:
            save_observation(student_id=sid, category=category, record_type=record_type, observed_at=stamp,
                             subject=subject, metric="backlog_count", value=numeric_values["backlogs"],
                             details=details, source=source, import_id=import_id,
                             synthetic=guest or _has_demo_provenance(details.get("data_origin")))
        saved += 1
    with connect() as db:
        db.execute("UPDATE imports SET imported_rows=?, errors=? WHERE id=?", (saved, json.dumps(errors), import_id))
    return {"import_id": import_id, "source": source, "data_type": data_type, "total_rows": len(frame),
            "imported_rows": saved, "error_count": len(errors), "errors": errors,
            "ignored_columns": sorted(str(c) for c in frame.columns if str(c) not in canonical)}


@app.get("/imports")
def imports(role: str = Depends(require_roles("staff", "admin", "guest"))):
    records = list_imports()
    return [record for record in records if _has_demo_provenance(record.get("source"))] if role == "guest" else records


@app.get("/imports/{import_id}")
def get_import(import_id: int, role: str = Depends(require_roles("staff", "admin", "guest"))):
    from src.database import connect
    with connect() as db:
        row = db.execute("SELECT * FROM imports WHERE id=?", (import_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Import record not found")
        if role == "guest" and not _has_demo_provenance(row["source"]):
            raise HTTPException(404, "Import record not found")
        return dict(row) | {"errors": json.loads(row["errors"])}


@app.get("/at-risk")
def at_risk(
    risk_level: str | None = None,
    department: str | None = None,
    semester: str | None = None,
    role: str = Depends(require_roles("staff", "admin", "guest")),
):
    result = []
    for record in _students_for_role(role):
        if department and record.get("department") != department:
            continue
        if semester and str(record.get("semester")) != str(semester):
            continue
        score = calculate_success_score(record["data"])
        if score["reliable"] and score["score"] is not None and score["score"] < 65:
            level = "High Risk" if score["score"] < 40 else "Medium Risk"
            if risk_level and level != risk_level:
                continue
            weak = sorted(((name, value) for name, value in score["category_scores"].items() if value is not None), key=lambda p: p[1])
            result.append({
                "student_id": record["student_id"],
                "name": record["data"].get("name"),
                "score": score["score"],
                "risk_level": level,
                "data_coverage": score["coverage_percent"],
                "department": record.get("department"),
                "semester": record.get("semester"),
                "contributing_factors": weak[:3],
            })
    return result


@app.get("/segments/academic-strong-placement-low")
def academic_strong_placement_low(role: str = Depends(require_roles("staff", "admin", "guest"))):
    matches = []
    for record in _students_for_role(role):
        data = record["data"]
        academic_values = [data.get(k) for k in ("cgpa", "marks", "subject_performance") if data.get(k) is not None]
        placement_values = [data.get(k) for k in ("aptitude", "coding_assessment", "mock_interview") if data.get(k) is not None]
        if not academic_values or not placement_values:
            continue
        try:
            academic = sum(float(v) * (10 if k == "cgpa" else 1) for k, v in ((k, data.get(k)) for k in ("cgpa", "marks", "subject_performance")) if v is not None) / len(academic_values)
            placement = sum(float(v) for v in placement_values) / len(placement_values)
        except (TypeError, ValueError):
            continue
        if academic >= 70 and placement < 50:
            matches.append({"student_id": record["student_id"], "name": data.get("name"),
                            "academic_score": round(academic, 1), "placement_readiness": round(placement, 1),
                            "suggestion": "Offer aptitude, coding practice, or mock interview support based on the weakest observed indicator."})
    return matches


@app.get("/reports/students.csv")
def student_csv_report(role: str = Depends(require_roles("staff", "admin", "guest"))):
    records = _students_for_role(role)
    rows = []
    for record in records:
        score = calculate_success_score(record["data"])
        rows.append(record["data"] | {
            "student_id": record["student_id"],
            "department": record.get("department"),
            "semester": record.get("semester"),
            "cohort": record.get("cohort"),
            "data_origin": record["data"].get("data_origin") or "UNSPECIFIED",
            "source_file": record.get("source"),
            "success_score": score["score"] if score["reliable"] else None,
            "score_coverage_percent": score["coverage_percent"],
            "score_sufficient_data": score["reliable"],
        })
    output = io.StringIO()
    pd.DataFrame(rows).to_csv(output, index=False)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=student_report.csv"},
    )


@app.get("/reports/observations.csv")
def observation_csv_report(role: str = Depends(require_roles("staff", "admin", "guest"))):
    records = _observations_for_role(role)
    rows = [{key: value for key, value in record.items() if key != "details"} |
            {"details": json.dumps(record["details"], sort_keys=True),
             "data_origin": "SYNTHETIC" if record["synthetic"] else "IMPORTED / UNSPECIFIED"}
            for record in records]
    output = io.StringIO()
    pd.DataFrame(rows, columns=["id", "student_id", "category", "record_type", "observed_at", "subject", "metric",
        "value", "details", "source", "import_id", "synthetic", "created_at", "data_origin"]).to_csv(output, index=False)
    return StreamingResponse(io.BytesIO(output.getvalue().encode("utf-8")), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=student_observations.csv"})


@app.get("/reports/students.xlsx")
def student_excel_report(role: str = Depends(require_roles("staff", "admin", "guest"))):
    records = _students_for_role(role)
    rows = []
    for record in records:
        score = calculate_success_score(record["data"])
        rows.append(record["data"] | {"student_id": record["student_id"],
                                       "department": record.get("department") or record["data"].get("department"),
                                       "semester": record.get("semester") or record["data"].get("semester"),
                                       "cohort": record.get("cohort") or record["data"].get("cohort"),
                                       "source_file": record.get("source"),
                                       "data_origin": record["data"].get("data_origin") or "UNSPECIFIED",
                                       "success_score": score["score"] if score["reliable"] else None,
                                       "score_coverage_percent": score["coverage_percent"], "score_sufficient_data": score["reliable"]})
    output = io.BytesIO()
    pd.DataFrame(rows).to_excel(output, index=False, sheet_name="Students")
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=student_report.xlsx"})


@app.get("/reports/summary.pdf")
def summary_pdf_report(role: str = Depends(require_roles("staff", "admin", "guest"))):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    records = _students_for_role(role)
    origin_counts = Counter()
    for record in records:
        origin = str(record["data"].get("data_origin") or "UNSPECIFIED").strip()
        key = "synthetic" if "synthetic" in origin.lower() else "unspecified" if origin.upper() == "UNSPECIFIED" else "other_declared"
        origin_counts[key] += 1
    overview_data = overview(role)
    risks = at_risk(role=role)
    output = io.BytesIO()
    document = SimpleDocTemplate(output, pagesize=letter, rightMargin=0.55*inch, leftMargin=0.55*inch, pageCompression=0)
    styles = getSampleStyleSheet()
    content = [Paragraph("CampusLuma - Guest Demo Synthetic Summary" if role == "guest" else "CampusLuma - Student Success Summary", styles["Title"]),
               Paragraph("AI-Powered Student Success Intelligence | Illuminate Student Success. | KPMG India Smart Campus Analytics Challenge", styles["BodyText"]),
               *([Paragraph("Guest Demo report: synthetic records from the isolated sandbox only; no operational records are included.", styles["BodyText"])] if role == "guest" else []),
               Paragraph("Generated from records currently stored in the isolated database scope. Prototype score weights and risk thresholds are unvalidated policy assumptions.", styles["BodyText"]), Spacer(1, 14)]
    content.insert(2, Paragraph(
        f"Profile provenance: {origin_counts['synthetic']} explicitly synthetic-labelled; {origin_counts['other_declared']} with another declared origin; {origin_counts['unspecified']} unspecified. A non-synthetic label does not independently prove institutional origin.",
        styles["BodyText"],
    ))
    metrics = [["Students", "Sufficiently covered scores", "Insufficient data", "Mean score"],
               [overview_data["student_count"], overview_data["scored_students"], overview_data["insufficient_data"], overview_data["average_success_score"] if overview_data["average_success_score"] is not None else "—"]]
    table = Table(metrics, repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#123b5d")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .4, colors.grey), ("PADDING", (0,0), (-1,-1), 7)]))
    content.extend([table, Spacer(1, 14), Paragraph("At-risk students", styles["Heading2"])])
    risk_rows = [["Student ID", "Name", "Score", "Risk", "Provenance", "Lowest observed categories"]]
    record_by_id = {record["student_id"]: record for record in records}
    risk_rows.extend([[r["student_id"], r.get("name") or "", r["score"], r["risk_level"],
                       record_by_id.get(r["student_id"], {}).get("data", {}).get("data_origin") or "UNSPECIFIED",
                       ", ".join(f"{name}: {value}" for name, value in r["contributing_factors"])] for r in risks[:40]])
    if len(risk_rows) == 1:
        risk_rows.append(["No sufficiently covered at-risk records", "", "", "", "", ""])
    risk_table = Table(risk_rows, repeatRows=1, colWidths=[.95*inch, 1.1*inch, .5*inch, .7*inch, 1.05*inch, 2.0*inch])
    risk_table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#123b5d")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .35, colors.grey), ("FONTSIZE", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 5)]))
    content.append(risk_table)
    document.build(content)
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=campus_summary.pdf"})


@app.post("/interventions")
def create_intervention(body: InterventionInput, actor: dict = Depends(session),
                        role: str = Depends(require_roles("staff", "admin", "guest"))):
    student_id = body.student_id.strip()
    description = body.description.strip()
    if not student_id:
        raise HTTPException(422, "student_id is required")
    if not description:
        raise HTTPException(422, "description is required")
    follow_up_date = _validated_follow_up_date(body.follow_up_date)
    if role == "guest" and not any(item["student_id"] == student_id for item in _guest_students()):
        raise HTTPException(404, "Student not found in the synthetic guest workspace")
    with connect() as db:
        if not db.execute("SELECT 1 FROM students WHERE student_id=?", (student_id,)).fetchone():
            raise HTTPException(404, "Student not found")
        cursor = db.execute("INSERT INTO interventions(student_id,description,owner,follow_up_date) VALUES(?,?,?,?)",
                            (student_id, description, body.owner.strip() if body.owner else None, follow_up_date))
        db.execute("INSERT INTO intervention_history(intervention_id,action,status,owner,follow_up_date,actor) VALUES(?,?,?,?,?,?)",
                   (cursor.lastrowid, "created", "Open", body.owner.strip() if body.owner else None, follow_up_date, actor.get("email") or f"API token ({actor.get('role')})"))
        return {"id": cursor.lastrowid, "student_id": student_id, "description": description,
                "owner": body.owner.strip() if body.owner else None, "follow_up_date": follow_up_date, "status": "Open"}


def _validated_follow_up_date(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except (AttributeError, TypeError, ValueError) as exc:
        raise HTTPException(422, "follow_up_date must be a valid ISO date (YYYY-MM-DD)") from exc


@app.get("/interventions")
def interventions(role: str = Depends(require_roles("staff", "admin", "guest"))):
    with connect() as db:
        rows = [dict(r) for r in db.execute("SELECT * FROM interventions ORDER BY created_at DESC")]
    if role == "guest":
        allowed_ids = {item["student_id"] for item in _guest_students()}
        rows = [row for row in rows if row["student_id"] in allowed_ids]
    return rows


@app.patch("/interventions/{intervention_id}")
def update_intervention(intervention_id: int, body: InterventionUpdate, actor: dict = Depends(session),
                        role: str = Depends(require_roles("staff", "admin", "guest"))):
    allowed_status = {"Open", "In Progress", "Completed", "Cancelled"}
    updates = dump_model(body, exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Provide at least one field to update")
    if "status" in updates and updates["status"] not in allowed_status:
        raise HTTPException(422, "status must be Open, In Progress, Completed, or Cancelled")
    if "owner" in updates and updates["owner"] is not None:
        updates["owner"] = updates["owner"].strip() or None
    if "follow_up_date" in updates:
        updates["follow_up_date"] = _validated_follow_up_date(updates["follow_up_date"])
    with connect() as db:
        existing = db.execute("SELECT * FROM interventions WHERE id=?", (intervention_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Intervention not found")
        if role == "guest" and existing["student_id"] not in {item["student_id"] for item in _guest_students()}:
            raise HTTPException(404, "Intervention not found")
        columns = ", ".join(f"{key}=?" for key in updates)
        db.execute(f"UPDATE interventions SET {columns} WHERE id=?", (*updates.values(), intervention_id))
        current = dict(db.execute("SELECT * FROM interventions WHERE id=?", (intervention_id,)).fetchone())
        db.execute("INSERT INTO intervention_history(intervention_id,action,status,owner,follow_up_date,actor) VALUES(?,?,?,?,?,?)",
                   (intervention_id, "updated", current["status"], current["owner"], current["follow_up_date"],
                    actor.get("email") or f"API token ({actor.get('role')})"))
        return current


@app.get("/interventions/{intervention_id}/history")
def intervention_history(intervention_id: int, role: str = Depends(require_roles("staff", "admin", "guest"))):
    with connect() as db:
        intervention = db.execute("SELECT * FROM interventions WHERE id=?", (intervention_id,)).fetchone()
        if not intervention or (role == "guest" and intervention["student_id"] not in {item["student_id"] for item in _guest_students()}):
            raise HTTPException(404, "Intervention not found")
        return [dict(row) for row in db.execute(
            "SELECT id, action, status, owner, follow_up_date, actor, changed_at FROM intervention_history WHERE intervention_id=? ORDER BY id",
            (intervention_id,))]
