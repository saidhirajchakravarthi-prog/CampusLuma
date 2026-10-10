# Smart Campus Analytics — development prototype

This repository upgrades the original student performance project while retaining its Python Random Forest, FastAPI API, and Streamlit interface. SQLite is used for local development so no database server is required. It is a prototype, not a validated student decision system.

## Requirements and setup

Use Python 3.10 or newer; Python 3.12 or 3.13 is a conservative choice for package compatibility. Python is not installed in the current verification environment. On Windows, install a standard Python runtime from the [official Python for Windows downloads](https://www.python.org/downloads/windows/) or Microsoft Store. Select the Python Install Manager or a normal x64 runtime, then reopen PowerShell. Confirm the runtime with `py -0p` or `python --version`; the `py` launcher alone does not mean a runtime is installed.

From the repository root, create the virtual environment and install the dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pytest -q
```

Configure separate API and Streamlit terminals using a strong random token. `.env.example` lists the environment variables; the application does not automatically load `.env` files:

```powershell
$env:CAMPUS_API_KEYS='{"your-long-random-token":"admin"}'
$env:CAMPUS_API_TOKEN='your-long-random-token'
```

Allowed roles are `viewer`, `analyst`, `staff`, and `admin`. All API routes require a bearer token. Viewer/analyst tokens can access aggregate overview and cohort results; staff/admin tokens can access student-level profiles, risk lists, imports, interventions, and reports. Only staff/admin can change records. This is a lightweight local API-key control, not a complete institutional identity provider or production-grade authorization system. Use TLS and managed secrets before any deployment.

The local database is created at `data/campus.db` on API startup. Set `CAMPUS_DB_PATH` to use a different database location. The schema is initialized idempotently with SQLite `user_version=1`; there is no external migration tool yet.

## Start the application

The database schema is initialized automatically when the API starts. To initialize it explicitly, set the same database path that the API will use, then run:

```powershell
$env:CAMPUS_DB_PATH = (Join-Path (Get-Location) 'data\campus.db')
python -c "from src.database import initialize; initialize()"
```

Open two PowerShell terminals from the repository root. In terminal 1 configure the API token and database path, initialize the schema, and start the API:

```powershell
$env:CAMPUS_API_KEYS='{"dev-only-change-this-token":"admin"}'
$env:CAMPUS_DB_PATH = (Join-Path (Get-Location) 'data\campus.db')
python -c "from src.database import initialize; initialize()"
uvicorn main:app --reload
```

To generate and import synthetic dashboard rows, use a third terminal or stop the API after generation and use terminal 2 below. With the API running, from another terminal:

```powershell
python data/generate_campus_data.py
curl.exe -H "Authorization: Bearer dev-only-change-this-token" -F "file=@data/dev_campus_students.csv" http://127.0.0.1:8000/imports
```

In terminal 2 configure the same token for Streamlit and start the UI:

```powershell
$env:CAMPUS_API_TOKEN='dev-only-change-this-token'
$env:CAMPUS_API_URL='http://127.0.0.1:8000'
streamlit run app.py
```

The API documentation is available at `http://127.0.0.1:8000/docs`. Set the same `CAMPUS_API_TOKEN` in the Streamlit terminal. Streamlit reads all displayed student metrics and lists from that API; empty databases show empty states rather than fabricated campus metrics.

## Import records

Use **Data import & quality** in Streamlit, or post a CSV/Excel file to `/imports`. `student_id` is required. Optional columns include:

| Category | Canonical columns accepted |
|---|---|
| Academic | `cgpa`, `marks`, `backlogs`, `subject_performance` |
| Attendance | `attendance`, `subject_attendance` |
| LMS activity | `lms_logins`, `assignment_completion`, `learning_activity` |
| Engagement | `clubs`, `events`, `hackathons`, `certifications` |
| Placement | `aptitude`, `coding_assessment`, `mock_interview` |
| Skills | `technical_skills`, `soft_skills` |
| Feedback | `student_satisfaction`, `faculty_feedback` |

Student ID matches update existing records. Duplicate IDs within one upload and invalid values are reported with row numbers. Column names can be mapped with the `mapping` query parameter, a JSON object from canonical name to source header, for example:

```powershell
curl.exe -F "file=@students.csv" "http://127.0.0.1:8000/imports?mapping=%7B%22student_id%22%3A%22Roll%20No%22%7D"
```

Imports, source names, timestamps, counts, and row errors are stored in the database. Use only synthetic or appropriately authorized data in development.

To populate the seven categories for a local dashboard walkthrough, run `python data/generate_campus_data.py` and import `data/dev_campus_students.csv` as shown above. Rows include `data_origin=SYNTHETIC_DEVELOPMENT_ONLY`, DEMO IDs, and synthetic names. To create the separate synthetic labels used by the experimental classifier, run `python data/generate_data.py` as described below; the generated rows also include an explicit synthetic origin marker.

## Success score and risk

The backend normalizes indicators to 0–100 (CGPA × 10; backlogs deduct 20 points each; engagement and LMS counts are capped at 10 and scaled to 100; percentage indicators are clipped to 0–100) and averages observed indicators within each category. Category weights are academic 25%, attendance 15%, LMS 12%, engagement 10%, placement readiness 18%, skills 12%, feedback 8%. The scoring service accepts explicit replacement weights and a coverage threshold; these are prototype assumptions, not scientifically validated. Scores are reweighted over categories with data; coverage is the sum of their configured weights. The default overall score is considered sufficiently covered at 50% category weight. Missing categories are never silently treated as zero.

`/at-risk` identifies sufficiently covered scores under 65 and shows the lowest observed categories as contributing factors. Placement readiness is an aggregate of observed aptitude, coding, and mock interview indicators. The dashboard includes API-backed cohort summaries, a strong-academics/low-placement segment, read-only student profiles, intervention status updates, and CSV/Excel/PDF exports. It does not provide profile editing or detailed subject-level trends.

## Experimental model

The existing dataset is synthetic and its pass outcome is derived from a generated score formula. It cannot support claims about real-world predictive accuracy. Training is a separate explicit command:

```powershell
python data/generate_data.py
python -m src.train
```

Training fits preprocessing and the Random Forest inside one saved pipeline, uses a stratified held-out split, and writes experimental metrics to `models/metrics.json`. Application startup does not train or load the model. `/predict` reports a clear missing-artifact error until training has been run. Do not use the predictions for consequential decisions about students.

## Tests

```powershell
python -m pytest
```

The included tests cover feature validation, score coverage/weighting, authenticated database imports, role restrictions, partial updates, and missing model artifact handling. Run them with `python -m pytest -q`; report results from the environment in which they actually ran.

## Current limitations

- SQLite persistence is for local development; SQLAlchemy, PostgreSQL, formal migrations, and a production database setup are not implemented.
- API-key bearer authentication and basic role checks are implemented. Production user provisioning, institutional SSO, fine-grained per-record access, audit logging, and encryption at rest are not implemented. Do not expose this prototype or its student records to an untrusted network.
- The API currently accepts only localhost Streamlit CORS requests; it has no institutional SIS/LMS integrations or scheduled feeds.
- Import support handles flat rows, not relational subject-level records. Duplicate IDs within a file are rejected; matching database IDs update the existing profile while blank or absent values preserve stored values. There is no row-level change audit or field-level sensitive-data policy.
- Intervention records can be created, listed, assigned an owner and follow-up date, and moved between basic statuses. There is no notification or audit-history workflow.
- CSV exports, an Excel student report, a PDF summary report, and CSV/Excel imports are available. Detailed subject-level charts, formal security controls, and full integration/end-to-end tests remain to be built.
- Model metrics from the generated dataset are experimental and must not be presented as institutional performance evidence.
