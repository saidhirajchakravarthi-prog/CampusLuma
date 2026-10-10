"""Create clearly synthetic, non-institutional rows for local UI development only."""
from pathlib import Path

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
COUNT = 120
departments = np.array(["Computer Science", "Commerce", "Mechanical", "Biotechnology"])
rows = []
for index in range(COUNT):
    cgpa = round(float(RNG.uniform(4.5, 10)), 2)
    rows.append({
        "student_id": f"DEMO-{1001 + index}",
        "name": f"Synthetic Student {index + 1:03d}",
        "data_origin": "SYNTHETIC_DEVELOPMENT_ONLY",
        "department": str(RNG.choice(departments)),
        "semester": int(RNG.integers(1, 9)),
        "cohort": str(RNG.choice(["2024", "2025", "2026"])),
        "cgpa": cgpa,
        "marks": round(float(RNG.uniform(35, 100)), 1),
        "backlogs": int(RNG.integers(0, 4)),
        "subject_performance": round(float(RNG.uniform(35, 100)), 1),
        "attendance": round(float(RNG.uniform(45, 100)), 1),
        "subject_attendance": round(float(RNG.uniform(40, 100)), 1),
        "lms_logins": int(RNG.integers(0, 11)),
        "assignment_completion": round(float(RNG.uniform(20, 100)), 1),
        "learning_activity": int(RNG.integers(0, 11)),
        "clubs": int(RNG.integers(0, 11)),
        "events": int(RNG.integers(0, 11)),
        "hackathons": int(RNG.integers(0, 11)),
        "certifications": int(RNG.integers(0, 11)),
        "aptitude": round(float(RNG.uniform(20, 100)), 1),
        "coding_assessment": round(float(RNG.uniform(10, 100)), 1),
        "mock_interview": round(float(RNG.uniform(15, 100)), 1),
        "technical_skills": round(float(RNG.uniform(20, 100)), 1),
        "soft_skills": round(float(RNG.uniform(20, 100)), 1),
        "student_satisfaction": round(float(RNG.uniform(35, 100)), 1),
        "faculty_feedback": round(float(RNG.uniform(35, 100)), 1),
    })

output = Path(__file__).resolve().parent / "dev_campus_students.csv"
pd.DataFrame(rows).to_csv(output, index=False)
print(f"Wrote {COUNT} synthetic development records to {output}")
