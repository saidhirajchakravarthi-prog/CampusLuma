"""FastAPI application for student records, imports, scores, and analytics."""
import io
import json
import os
import hmac
from collections import Counter

import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from src.database import initialize, list_imports, list_students, record_import, save_student
from src.success_score import calculate_success_score

bearer = HTTPBearer(auto_error=False)


def authenticate(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    try:
        configured = json.loads(os.getenv("CAMPUS_API_KEYS", "{}"))
    except json.JSONDecodeError:
        configured = {}
    if credentials is None or not isinstance(configured, dict):
        raise HTTPException(401, "Valid bearer token required")
    role = next((value for token, value in configured.items() if hmac.compare_digest(token, credentials.credentials)), None)
    if role not in ("viewer", "analyst", "staff", "admin"):
        raise HTTPException(401, "Invalid bearer token")
    return role


def require_roles(*allowed):
    def check(role=Depends(authenticate)):
        if role not in allowed:
            raise HTTPException(403, "Your role cannot perform this action")
        return role
    return check


app = FastAPI(title="Smart Campus Analytics API", version="0.2.0", dependencies=[Depends(authenticate)])
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:8501", "http://localhost:5173"], allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH"], allow_headers=["Authorization", "Content-Type"])


@app.on_event("startup")
def startup():
    initialize()


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


@app.get("/")
def home():
    return {"message": "Smart Campus Analytics API", "docs": "/docs"}


@app.get("/session")
def session(role=Depends(authenticate)):
    return {"role": role}


@app.post("/predict")
def predict(body: PredictionInput):
    from src.predict import predict_student
    try:
        return predict_student(body.dict(exclude_none=True))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/students", dependencies=[Depends(require_roles("staff", "admin"))])
def students(search: str | None = None, department: str | None = None, semester: str | None = None):
    records = list_students()
    if search:
        records = [r for r in records if search.lower() in r["student_id"].lower() or search.lower() in str(r["data"].get("name", "")).lower()]
    if department:
        records = [r for r in records if r.get("department") == department]
    if semester:
        records = [r for r in records if str(r.get("semester")) == str(semester)]
    return [r | {"success_score": calculate_success_score(r["data"])} for r in records]


@app.get("/students/{student_id}", dependencies=[Depends(require_roles("staff", "admin"))])
def student_profile(student_id: str):
    found = next((r for r in list_students() if r["student_id"] == student_id), None)
    if not found:
        raise HTTPException(404, "Student not found")
    return found | {"success_score": calculate_success_score(found["data"])}


@app.post("/imports", dependencies=[Depends(require_roles("staff", "admin"))])
async def import_students(file: UploadFile = File(...), mapping: str | None = Query(None, description="JSON map of canonical field to source column")):
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
    frame = frame.rename(columns={source: canonical for canonical, source in aliases.items()})
    if "student_id" not in frame.columns:
        raise HTTPException(422, "A student_id column is required; supply a column mapping if needed")
    seen, errors, count = set(), [], 0
    allowed = {"student_id", "name", "data_origin", "department", "semester", "cohort", "study_hours", "attendance", "assignments", "quizzes",
               "cgpa", "marks", "backlogs", "subject_performance", "subject_attendance", "lms_logins", "assignment_completion",
               "learning_activity", "clubs", "events", "hackathons", "certifications", "aptitude", "coding_assessment",
               "mock_interview", "technical_skills", "soft_skills", "student_satisfaction", "faculty_feedback"}
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
        save_student(sid, data, file.filename or "upload")
        count += 1
    import_id = record_import(file.filename or "upload", len(frame), count, errors)
    return {"import_id": import_id, "source": file.filename, "total_rows": len(frame), "imported_rows": count,
            "error_count": len(errors), "errors": errors, "ignored_columns": ignored_columns}


@app.get("/imports", dependencies=[Depends(require_roles("staff", "admin"))])
def imports():
    return list_imports()


@app.get("/overview")
def overview():
    records = list_students()
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


@app.get("/at-risk", dependencies=[Depends(require_roles("staff", "admin"))])
def at_risk():
    result = []
    for record in list_students():
        score = calculate_success_score(record["data"])
        if score["reliable"] and score["score"] is not None and score["score"] < 65:
            weak = sorted(((name, value) for name, value in score["category_scores"].items() if value is not None), key=lambda p: p[1])
            result.append({"student_id": record["student_id"], "name": record["data"].get("name"), "score": score["score"],
                           "risk_level": "High Risk" if score["score"] < 40 else "Medium Risk", "contributing_factors": weak[:3]})
    return result


@app.get("/segments/academic-strong-placement-low", dependencies=[Depends(require_roles("staff", "admin"))])
def academic_strong_placement_low():
    matches = []
    for record in list_students():
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


@app.get("/cohorts")
def cohort_analytics():
    grouped = {}
    for record in list_students():
        key = (record.get("department") or "Unspecified", record.get("semester") or "Unspecified", record.get("cohort") or "Unspecified")
        score = calculate_success_score(record["data"])
        item = grouped.setdefault(key, {"students": 0, "scored": 0, "score_sum": 0.0})
        item["students"] += 1
        if score["reliable"] and score["score"] is not None:
            item["scored"] += 1
            item["score_sum"] += score["score"]
    return [{"department": k[0], "semester": k[1], "cohort": k[2], "students": v["students"], "scored_students": v["scored"],
             "average_success_score": round(v["score_sum"] / v["scored"], 1) if v["scored"] else None} for k, v in grouped.items()]


@app.get("/reports/students.xlsx", dependencies=[Depends(require_roles("staff", "admin"))])
def student_excel_report():
    records = list_students()
    rows = []
    for record in records:
        score = calculate_success_score(record["data"])
        rows.append(record["data"] | {"student_id": record["student_id"], "success_score": score["score"] if score["reliable"] else None,
                                       "score_coverage_percent": score["coverage_percent"], "score_sufficient_data": score["reliable"]})
    output = io.BytesIO()
    pd.DataFrame(rows).to_excel(output, index=False, sheet_name="Students")
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=student_report.xlsx"})


@app.get("/reports/summary.pdf", dependencies=[Depends(require_roles("staff", "admin"))])
def summary_pdf_report():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    overview_data = overview()
    risks = at_risk()
    output = io.BytesIO()
    document = SimpleDocTemplate(output, pagesize=letter, rightMargin=0.55*inch, leftMargin=0.55*inch)
    styles = getSampleStyleSheet()
    content = [Paragraph("Smart Campus Analytics — Student Summary", styles["Title"]),
               Paragraph("Generated from records currently stored in the local database. Prototype score weights and risk thresholds are unvalidated policy assumptions.", styles["BodyText"]), Spacer(1, 14)]
    metrics = [["Students", "Sufficiently covered scores", "Insufficient data", "Mean score"],
               [overview_data["student_count"], overview_data["scored_students"], overview_data["insufficient_data"], overview_data["average_success_score"] if overview_data["average_success_score"] is not None else "—"]]
    table = Table(metrics, repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#123b5d")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .4, colors.grey), ("PADDING", (0,0), (-1,-1), 7)]))
    content.extend([table, Spacer(1, 14), Paragraph("At-risk students", styles["Heading2"])])
    risk_rows = [["Student ID", "Name", "Score", "Risk", "Lowest observed categories"]]
    risk_rows.extend([[r["student_id"], r.get("name") or "", r["score"], r["risk_level"], ", ".join(f"{name}: {value}" for name, value in r["contributing_factors"])] for r in risks[:40]])
    if len(risk_rows) == 1:
        risk_rows.append(["No sufficiently covered at-risk records", "", "", "", ""])
    risk_table = Table(risk_rows, repeatRows=1, colWidths=[1.05*inch, 1.2*inch, .55*inch, .8*inch, 2.8*inch])
    risk_table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#123b5d")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .35, colors.grey), ("FONTSIZE", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 5)]))
    content.append(risk_table)
    document.build(content)
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=campus_summary.pdf"})


@app.post("/interventions", dependencies=[Depends(require_roles("staff", "admin"))])
def create_intervention(body: InterventionInput):
    from src.database import connect
    with connect() as db:
        if not db.execute("SELECT 1 FROM students WHERE student_id=?", (body.student_id,)).fetchone():
            raise HTTPException(404, "Student not found")
        cursor = db.execute("INSERT INTO interventions(student_id,description,owner,follow_up_date) VALUES(?,?,?,?)",
                            (body.student_id, body.description, body.owner, body.follow_up_date))
        return {"id": cursor.lastrowid, **body.dict(), "status": "Open"}


@app.get("/interventions", dependencies=[Depends(require_roles("staff", "admin"))])
def interventions():
    from src.database import connect
    with connect() as db:
        return [dict(r) for r in db.execute("SELECT * FROM interventions ORDER BY created_at DESC")]


@app.patch("/interventions/{intervention_id}", dependencies=[Depends(require_roles("staff", "admin"))])
def update_intervention(intervention_id: int, body: InterventionUpdate):
    allowed_status = {"Open", "In Progress", "Completed", "Cancelled"}
    updates = body.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Provide at least one field to update")
    if "status" in updates and updates["status"] not in allowed_status:
        raise HTTPException(422, "status must be Open, In Progress, Completed, or Cancelled")
    from src.database import connect
    with connect() as db:
        if not db.execute("SELECT 1 FROM interventions WHERE id=?", (intervention_id,)).fetchone():
            raise HTTPException(404, "Intervention not found")
        columns = ", ".join(f"{key}=?" for key in updates)
        db.execute(f"UPDATE interventions SET {columns} WHERE id=?", (*updates.values(), intervention_id))
        return dict(db.execute("SELECT * FROM interventions WHERE id=?", (intervention_id,)).fetchone())
