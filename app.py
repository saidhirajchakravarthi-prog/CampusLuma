"""Streamlit client for the persistent Smart Campus Analytics API."""
import os

import pandas as pd
import requests
import streamlit as st

API = os.getenv("CAMPUS_API_URL", "http://127.0.0.1:8000")
API_TOKEN = os.getenv("CAMPUS_API_TOKEN", "")
st.set_page_config(page_title="Smart Campus Analytics", page_icon="🎓", layout="wide")
st.title("🎓 Smart Campus Analytics")
st.caption("Student success analytics · Prototype scoring weights are policy assumptions, not validated predictions.")


def api(path, method="get", **kwargs):
    try:
        response = requests.request(method, API + path, timeout=15,
                                    headers={"Authorization": f"Bearer {API_TOKEN}"}, **kwargs)
        if response.status_code in (401, 403):
            st.error(f"Access denied by the API ({response.status_code}). Check CAMPUS_API_TOKEN and its configured role.")
            return None
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        st.error(f"API request failed. Confirm the backend is running at {API}. Details: {exc}")
        return None


def report_bytes(path):
    try:
        response = requests.get(API + path, headers={"Authorization": f"Bearer {API_TOKEN}"}, timeout=30)
        response.raise_for_status()
        return response.content
    except requests.RequestException as exc:
        st.error(f"Report generation failed: {exc}")
        return None


session = api("/session")
role = session.get("role") if session else None
workspace = ["Overview", "Segments & cohorts", "Predict"]
if role in ("staff", "admin"):
    workspace = ["Overview", "Student directory", "At-risk students", "Segments & cohorts", "Data import & quality", "Interventions", "Predict"]
view = st.sidebar.radio("Workspace", workspace)

if view == "Overview":
    data = api("/overview")
    if data:
        a, b, c, d = st.columns(4)
        a.metric("Students", data["student_count"])
        b.metric("Sufficiently covered scores", data["scored_students"])
        c.metric("Needs more data", data["insufficient_data"])
        d.metric("Mean score", data["average_success_score"] if data["average_success_score"] is not None else "—")
        e, f, g = st.columns(3)
        e.metric("Mean attendance", f"{data['average_attendance']}%" if data["average_attendance"] is not None else "—")
        f.metric("Placement readiness", f"{data['average_placement_readiness']}%" if data["average_placement_readiness"] is not None else "—")
        f.caption("Mean of recorded aptitude, coding and mock interview indicators")
        g.metric("At risk", data["risk_distribution"].get("High Risk", 0) + data["risk_distribution"].get("Medium Risk", 0))
        st.subheader("Success score distribution")
        distribution = data.get("success_score_distribution", {})
        if distribution:
            st.bar_chart(pd.Series(distribution, name="Students"), height=260)
        else:
            st.info("Import student records to populate live analytics. No example metrics are shown.")
        st.caption(data["score_method"])
        if role in ("staff", "admin"):
            excel = report_bytes("/reports/students.xlsx")
            pdf = report_bytes("/reports/summary.pdf")
            if excel:
                st.download_button("Download student Excel report", excel, "student_report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            if pdf:
                st.download_button("Download summary PDF", pdf, "campus_summary.pdf", "application/pdf")

elif view == "Student directory":
    st.subheader("Student directory")
    search, department, semester = st.columns(3)
    q = search.text_input("Search name or ID")
    dept = department.text_input("Department filter")
    sem = semester.text_input("Semester filter")
    params = {k: v for k, v in {"search": q, "department": dept, "semester": sem}.items() if v}
    records = api("/students", params=params) or []
    if records:
        st.dataframe(pd.DataFrame([{"Student ID": r["student_id"], "Name": r["data"].get("name"), "Department": r.get("department"), "Semester": r.get("semester"), "Cohort": r.get("cohort"), "Success score": r["success_score"]["score"] if r["success_score"]["reliable"] else "Insufficient data", "Updated": r["updated_at"]} for r in records]), use_container_width=True)
        selected = st.selectbox("Open student profile", [r["student_id"] for r in records])
        profile = api(f"/students/{selected}")
        if profile:
            st.json(profile["data"])
            st.write("Success score", profile["success_score"])
        st.download_button("Export directory CSV", pd.DataFrame([r["data"] | {"success_score": r["success_score"]["score"], "score_coverage": r["success_score"]["coverage_percent"]} for r in records]).to_csv(index=False), "students.csv", "text/csv")
    else:
        st.info("No matching stored records.")

elif view == "At-risk students":
    st.subheader("At-risk students")
    rows = api("/at-risk")
    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True)
        st.download_button("Download at-risk CSV", pd.DataFrame(rows).to_csv(index=False), "at_risk.csv", "text/csv")
    elif rows is not None:
        st.info("No sufficiently covered at-risk records are currently stored.")

elif view == "Segments & cohorts":
    if role in ("staff", "admin"):
        st.subheader("Strong academics, low placement readiness")
        segment = api("/segments/academic-strong-placement-low")
        if segment:
            st.dataframe(pd.DataFrame(segment), use_container_width=True)
        elif segment is not None:
            st.info("No students meet the segment thresholds with both data categories recorded.")
    st.subheader("Department, semester and cohort analytics")
    cohorts = api("/cohorts")
    if cohorts:
        st.dataframe(pd.DataFrame(cohorts), use_container_width=True)

elif view == "Data import & quality":
    st.subheader("Import CSV or Excel")
    st.write("Required: `student_id`. Optional canonical columns cover academics, attendance, LMS, engagement, placement, skills and feedback.")
    file = st.file_uploader("Choose CSV or Excel workbook", type=["csv", "xlsx", "xls"])
    mapping_text = st.text_input("Optional column map (JSON: canonical field → source column)", placeholder='{"student_id":"Roll No","cgpa":"CGPA"}')
    if st.button("Validate and import", disabled=file is None):
        params = {"mapping": mapping_text} if mapping_text else {}
        result = api("/imports", method="post", files={"file": (file.name, file.getvalue(), file.type or "application/octet-stream")}, params=params)
        if result:
            st.success(f"Imported or updated {result['imported_rows']} of {result['total_rows']} records.")
            if result.get("ignored_columns"):
                st.warning(f"Unmapped columns were ignored: {', '.join(result['ignored_columns'])}. Add them to the mapping if they contain student indicators.")
            if result["errors"]:
                st.dataframe(pd.DataFrame(result["errors"]), use_container_width=True)
    imports = api("/imports")
    if imports:
        st.subheader("Import history")
        st.dataframe(pd.DataFrame(imports), use_container_width=True)
    overview = api("/overview")
    if overview:
        st.subheader("Category coverage")
        st.bar_chart(pd.Series(overview["category_coverage"], name="Students with data"))

elif view == "Interventions":
    st.subheader("Intervention tracking")
    records = api("/students") or []
    if records:
        with st.form("intervention"):
            sid = st.selectbox("Student", [r["student_id"] for r in records])
            description = st.text_input("Action")
            owner = st.text_input("Assigned owner")
            followup = st.date_input("Follow-up date")
            save = st.form_submit_button("Create intervention")
        if save and description:
            result = api("/interventions", method="post", json={"student_id": sid, "description": description, "owner": owner or None, "follow_up_date": str(followup)})
            if result:
                st.success("Intervention recorded.")
    items = api("/interventions")
    if items:
        st.dataframe(pd.DataFrame(items), use_container_width=True)
        selected_id = st.selectbox("Update intervention", [item["id"] for item in items])
        selected_item = next(item for item in items if item["id"] == selected_id)
        with st.form("update_intervention"):
            status = st.selectbox("Status", ["Open", "In Progress", "Completed", "Cancelled"], index=["Open", "In Progress", "Completed", "Cancelled"].index(selected_item["status"]))
            updated_owner = st.text_input("Owner", value=selected_item.get("owner") or "")
            updated_date = st.text_input("Follow-up date (YYYY-MM-DD)", value=selected_item.get("follow_up_date") or "")
            update = st.form_submit_button("Save changes")
        if update:
            result = api(f"/interventions/{selected_id}", method="patch", json={"status": status, "owner": updated_owner or None, "follow_up_date": updated_date or None})
            if result:
                st.success("Intervention updated. Refresh the page to see the new values.")

else:
    st.subheader("Experimental academic risk analysis")
    st.warning("Only use synthetic development data for experimentation. Model output is not validated for real student decisions.")
    with st.form("predict"):
        study = st.number_input("Study hours per day", 0.0, 24.0, 4.0)
        attendance = st.number_input("Attendance (%)", 0.0, 100.0, 75.0)
        assignments = st.number_input("Assignment score (%)", 0.0, 100.0, 60.0)
        quizzes = st.number_input("Quiz score (%)", 0.0, 100.0, 60.0)
        submit = st.form_submit_button("Run prediction")
    if submit:
        result = api("/predict", method="post", json={"study_hours": study, "attendance": attendance, "assignments": assignments, "quizzes": quizzes})
        if result:
            st.metric(result["risk_level"], f"Pass probability {result['probability']:.1%}")
            st.write(f"Input coverage: {result['data_coverage']:.0%} · sufficient for interpretation: {'Yes' if result['interpretation_reliable'] else 'No'}")
            st.write("Contributing factors", result["contributing_factors"] or "No rule-based concerns identified in supplied values")
            st.write("Suggested support actions", result["interventions"])
            st.caption(result["model_note"] + " " + result["factor_method"])
