"""Small SQLite persistence layer suitable for local development."""
import json
import os
import sqlite3
from pathlib import Path
from contextvars import ContextVar

DB_PATH = Path(os.getenv("CAMPUS_DB_PATH", Path(__file__).resolve().parents[1] / "data" / "campus.db"))
_DEMO_WORKSPACE = ContextVar("campusluma_demo_workspace", default=False)


def demo_database_path() -> Path:
    configured = os.getenv("CAMPUS_DEMO_DB_PATH", "").strip()
    path = Path(configured) if configured else DB_PATH.with_name(f"{DB_PATH.stem}_demo{DB_PATH.suffix}")
    if path.resolve() == Path(DB_PATH).resolve():
        raise RuntimeError("CAMPUS_DEMO_DB_PATH must be a different file from CAMPUS_DB_PATH.")
    return path


def set_demo_workspace(enabled: bool):
    return _DEMO_WORKSPACE.set(enabled)


def reset_demo_workspace(token) -> None:
    _DEMO_WORKSPACE.reset(token)


def in_demo_workspace() -> bool:
    return _DEMO_WORKSPACE.get()


def connect(path=None):
    database_path = Path(path) if path is not None else (demo_database_path() if in_demo_workspace() else DB_PATH)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row
    return connection


def initialize():
    _initialize_path(DB_PATH)


def initialize_demo(seed_records=(), *, reset=False):
    """Initialize the isolated guest database and seed only explicitly synthetic records."""
    demo_path = demo_database_path()
    _initialize_path(demo_path)
    token = set_demo_workspace(True)
    try:
        with connect() as db:
            if reset:
                db.execute("DELETE FROM student_observations")
                db.execute("DELETE FROM intervention_history")
                db.execute("DELETE FROM interventions")
                db.execute("DELETE FROM imports")
                db.execute("DELETE FROM students")
            for record in seed_records:
                data = record.get("data") or {}
                source = str(record.get("source") or "")
                origin = str(data.get("data_origin") or "")
                if not record.get("student_id") or not _demo_label(source) or not _demo_label(origin):
                    continue
                db.execute(
                    """INSERT OR IGNORE INTO students(student_id,department,semester,cohort,payload,source)
                    VALUES(?,?,?,?,?,?)""",
                    (record["student_id"], record.get("department"), record.get("semester"),
                     record.get("cohort"), json.dumps(data), source),
                )
    finally:
        reset_demo_workspace(token)


def _demo_label(value):
    normalized = str(value or "").strip().lower()
    phrase = " ".join(normalized.replace("_", " ").replace("-", " ").replace(".", " ").split())
    words = set(phrase.split())
    if not phrase or words & {"real", "institutional", "production", "unknown", "unspecified", "unverified"} or any(marker in phrase for marker in ("not synthetic", "non synthetic", "nonsynthetic", "not demo", "non demo")):
        return False
    return bool(words & {"synthetic", "demo", "development"}) or "dev_campus" in normalized


def _initialize_path(path):
    with connect(path) as db:
        db.executescript("""
        PRAGMA user_version = 1;
        CREATE TABLE IF NOT EXISTS students (
          student_id TEXT PRIMARY KEY, department TEXT, semester TEXT, cohort TEXT,
          payload TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
        CREATE INDEX IF NOT EXISTS idx_students_semester ON students(semester);
        CREATE TABLE IF NOT EXISTS imports (
          id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          total_rows INTEGER NOT NULL, imported_rows INTEGER NOT NULL, errors TEXT NOT NULL,
          data_type TEXT NOT NULL DEFAULT 'students'
        );
        CREATE TABLE IF NOT EXISTS interventions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL,
          description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open', owner TEXT,
          follow_up_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(student_id)
        );
        CREATE TABLE IF NOT EXISTS intervention_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          intervention_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          status TEXT NOT NULL,
          owner TEXT,
          follow_up_date TEXT,
          actor TEXT,
          changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(intervention_id) REFERENCES interventions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          hashed_password TEXT NOT NULL,
          role TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE TABLE IF NOT EXISTS student_observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN ('academic','attendance','lms','engagement','placement','skills','feedback')),
          record_type TEXT NOT NULL,
          observed_at TEXT,
          subject TEXT,
          metric TEXT NOT NULL,
          value REAL,
          details TEXT NOT NULL DEFAULT '{}',
          source TEXT NOT NULL,
          import_id INTEGER,
          synthetic INTEGER NOT NULL DEFAULT 0 CHECK(synthetic IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(student_id),
          FOREIGN KEY(import_id) REFERENCES imports(id)
        );
        CREATE INDEX IF NOT EXISTS idx_observations_student_category_date
          ON student_observations(student_id, category, observed_at);
        CREATE INDEX IF NOT EXISTS idx_observations_category_metric
          ON student_observations(category, metric, observed_at);
        """)
        # Additive migration for databases created before actor attribution existed.
        history_columns = {row["name"] for row in db.execute("PRAGMA table_info(intervention_history)")}
        if "actor" not in history_columns:
            db.execute("ALTER TABLE intervention_history ADD COLUMN actor TEXT")
        import_columns = {row["name"] for row in db.execute("PRAGMA table_info(imports)")}
        if "data_type" not in import_columns:
            db.execute("ALTER TABLE imports ADD COLUMN data_type TEXT NOT NULL DEFAULT 'students'")
        db.execute("PRAGMA user_version = 2")


def save_student(student_id, data, source):
    with connect() as db:
        existing = db.execute("SELECT payload FROM students WHERE student_id=?", (student_id,)).fetchone()
        # A partial import or blank cell must not erase values already stored for this ID.
        merged = json.loads(existing["payload"]) if existing else {}
        for key, value in data.items():
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            merged[key] = value
        db.execute("""INSERT INTO students(student_id,department,semester,cohort,payload,source,updated_at)
        VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(student_id) DO UPDATE SET
        department=excluded.department, semester=excluded.semester, cohort=excluded.cohort,
        payload=excluded.payload, source=excluded.source, updated_at=CURRENT_TIMESTAMP""",
        (student_id, merged.get("department"), str(merged.get("semester")) if merged.get("semester") is not None else None,
         merged.get("cohort"), json.dumps(merged), source))


def list_students():
    with connect() as db:
        return [dict(row) | {"data": json.loads(row["payload"])} for row in db.execute("SELECT * FROM students ORDER BY student_id")]


def record_import(source, total, imported, errors, data_type="students"):
    with connect() as db:
        cur = db.execute("INSERT INTO imports(source,total_rows,imported_rows,errors,data_type) VALUES(?,?,?,?,?)",
                         (source, total, imported, json.dumps(errors), data_type))
        return cur.lastrowid


def list_imports():
    with connect() as db:
        return [dict(row) | {"errors": json.loads(row["errors"])} for row in db.execute("SELECT * FROM imports ORDER BY id DESC")]


def get_user_by_email(email: str):
    with connect() as db:
        row = db.execute("SELECT * FROM users WHERE LOWER(email)=LOWER(?)", (email.strip(),)).fetchone()
        return dict(row) if row else None


def ensure_firebase_viewer(email: str, name: str):
    """Create a least-privilege account for a verified Firebase identity if absent.

    Existing application roles and disabled accounts are never overwritten here.
    The random password hash is not usable for login because Firebase mode disables
    the local password endpoint.
    """
    import secrets
    from src.auth import hash_password

    normalized_email = email.strip().lower()
    safe_name = name.strip() or normalized_email.split("@", 1)[0]
    unusable_password_hash = hash_password(secrets.token_urlsafe(48))
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT * FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1", (normalized_email,)
        ).fetchone()
        if row is None:
            db.execute(
                "INSERT INTO users(email,name,hashed_password,role,is_active) VALUES(?,?,?,'viewer',1)",
                (normalized_email, safe_name, unusable_password_hash),
            )
            row = db.execute("SELECT * FROM users WHERE email=?", (normalized_email,)).fetchone()
        return dict(row)


def save_user(email: str, name: str, hashed_password: str, role: str, is_active: int = 1):
    with connect() as db:
        db.execute("""INSERT INTO users(email, name, hashed_password, role, is_active, updated_at)
        VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET
        name=excluded.name, hashed_password=excluded.hashed_password,
        role=excluded.role, is_active=excluded.is_active, updated_at=CURRENT_TIMESTAMP""",
        (email.strip().lower(), name.strip(), hashed_password, role.strip(), is_active))


def promote_existing_viewer_to_admin(email: str):
    """Promote exactly one existing active Viewer account without creating a row."""
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise ValueError("An account email is required.")

    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        matches = db.execute(
            "SELECT email, role, is_active FROM users WHERE LOWER(email)=LOWER(?)",
            (normalized_email,),
        ).fetchall()
        if not matches:
            raise ValueError("No existing account matches that email; no account was created.")
        if len(matches) != 1:
            raise ValueError("Multiple case-insensitive account matches exist; no account was changed.")

        account = matches[0]
        if not account["is_active"]:
            raise ValueError("The matching account is inactive; no account was changed.")
        if account["role"] == "admin":
            return "already_admin"
        if account["role"] != "viewer":
            raise ValueError("Only an existing Viewer account can be promoted by this command.")

        db.execute(
            "UPDATE users SET role='admin', updated_at=CURRENT_TIMESTAMP WHERE email=?",
            (account["email"],),
        )
        return "promoted"


def list_users():
    with connect() as db:
        return [dict(row) for row in db.execute("SELECT email, name, role, is_active, created_at, updated_at FROM users ORDER BY email")]


def save_observation(*, student_id, category, record_type, observed_at, subject, metric,
                     value, details, source, import_id=None, synthetic=False):
    with connect() as db:
        cur = db.execute(
            """INSERT INTO student_observations
            (student_id,category,record_type,observed_at,subject,metric,value,details,source,import_id,synthetic)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (student_id, category, record_type, observed_at, subject, metric, value,
        json.dumps(details, sort_keys=True, default=str), source, import_id, int(synthetic)),
        )
        return cur.lastrowid


def list_observations(student_id=None, category=None):
    clauses, params = [], []
    if student_id is not None:
        clauses.append("student_id=?")
        params.append(student_id)
    if category is not None:
        clauses.append("category=?")
        params.append(category)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with connect() as db:
        rows = db.execute("SELECT * FROM student_observations" + where + " ORDER BY observed_at, id", params)
        return [dict(row) | {"details": json.loads(row["details"])} for row in rows]
