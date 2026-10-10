import pandas as pd
import numpy as np
from pathlib import Path

np.random.seed(42)

n = 500

data = pd.DataFrame({
    "study_hours": np.random.uniform(1, 10, n),
    "attendance": np.random.uniform(50, 100, n),
    "assignments": np.random.uniform(40, 100, n),
    "quizzes": np.random.uniform(30, 100, n)
})

data["final_score"] = (
    0.3 * data["study_hours"] +
    0.3 * data["attendance"]/10 +
    0.2 * data["assignments"]/10 +
    0.2 * data["quizzes"]/10
)

data["pass"] = (data["final_score"] > 5).astype(int)
data["data_origin"] = "SYNTHETIC_DEVELOPMENT_ONLY"

output = Path(__file__).resolve().parent / "student_data.csv"
data.to_csv(output, index=False)
print("Dataset created")
