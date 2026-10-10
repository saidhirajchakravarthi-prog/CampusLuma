import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

df = pd.read_csv("data/student_data.csv")

sns.heatmap(df.corr(), annot=True)
plt.show()