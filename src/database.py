"""Small SQLite persistence layer suitable for local development."""
import json
import os
import sqlite3
from pathlib import Path

DB_PATH = Path(os.getenv("CAMPUS_DB_PATH", Path(__file__).resolve().parents[1] / "data" / "campus.db"))


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row
    return connection


def initialize():
    with connect() as db:
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
          total_rows INTEGER NOT NULL, imported_rows INTEGER NOT NULL, errors TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS interventions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL,
          description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open', owner TEXT,
          follow_up_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(student_id)
        );
        """)


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


def record_import(source, total, imported, errors):
    with connect() as db:
        cur = db.execute("INSERT INTO imports(source,total_rows,imported_rows,errors) VALUES(?,?,?,?)",
                         (source, total, imported, json.dumps(errors)))
        return cur.lastrowid


def list_imports():
    with connect() as db:
        return [dict(row) | {"errors": json.loads(row["errors"])} for row in db.execute("SELECT * FROM imports ORDER BY id DESC")]
