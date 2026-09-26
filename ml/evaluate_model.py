"""
ml/evaluate_model.py

Evaluates the trained COCOON
Random Forest model.
"""


import os

import pandas as pd

import matplotlib.pyplot as plt

import joblib


from sklearn.metrics import (

    mean_absolute_error,

    mean_squared_error,

    r2_score

)


# ==================================================
# FILE PATHS
# ==================================================

DATASET_FILE = (

    "datasets/thermal_ml_dataset.csv"

)


MODEL_FILE = (

    "models/cocoon_random_forest.joblib"

)


FEATURE_FILE = (

    "models/cocoon_features.joblib"

)


# ==================================================
# RESULTS DIRECTORY
# ==================================================

os.makedirs(

    "results",

    exist_ok=True

)


# ==================================================
# LOAD
# ==================================================

dataset = pd.read_csv(

    DATASET_FILE

)


model = joblib.load(

    MODEL_FILE

)


feature_names = joblib.load(

    FEATURE_FILE

)


dataset = dataset.drop(

    columns=[

        "timestamp"

    ],

    errors="ignore"

)


TARGET = (

    "target_indoor_temperature_C"

)


X = dataset[

    feature_names

]


y = dataset[

    TARGET

]


# ==================================================
# PREDICT
# ==================================================

predictions = (

    model.predict(

        X

    )

)


# ==================================================
# METRICS
# ==================================================

mae = (

    mean_absolute_error(

        y,

        predictions

    )

)


rmse = (

    mean_squared_error(

        y,

        predictions

    )

    ** 0.5

)


r2 = (

    r2_score(

        y,

        predictions

    )

)


print()

print(

    "=" * 60

)


print(

    "COCOON ML MODEL EVALUATION"

)


print(

    "=" * 60

)


print(

    f"\nMAE: "

    f"{mae:.4f} °C"

)


print(

    f"RMSE: "

    f"{rmse:.4f} °C"

)


print(

    f"R² Score: "

    f"{r2:.4f}"

)


# ==================================================
# ACTUAL VS PREDICTED GRAPH
# ==================================================

plt.figure(

    figsize=(10, 6)

)


plt.scatter(

    y,

    predictions,

    alpha=0.5

)


minimum = min(

    y.min(),

    predictions.min()

)


maximum = max(

    y.max(),

    predictions.max()

)


plt.plot(

    [

        minimum,

        maximum

    ],

    [

        minimum,

        maximum

    ]

)


plt.xlabel(

    "Physics Model Temperature (°C)"

)


plt.ylabel(

    "Random Forest Prediction (°C)"

)


plt.title(

    "COCOON: Physics vs ML Prediction"

)


plt.tight_layout()


plt.savefig(

    "results/physics_vs_ml.png",

    dpi=300

)


plt.show()


# ==================================================
# FEATURE IMPORTANCE
# ==================================================

importance_df = (

    pd.DataFrame(

        {

            "feature":

                feature_names,

            "importance":

                model.feature_importances_

        }

    )

)


importance_df = (

    importance_df.sort_values(

        "importance",

        ascending=False

    )

)


importance_df.to_csv(

    "results/feature_importance.csv",

    index=False

)


top_features = (

    importance_df.head(

        15

    )

)


plt.figure(

    figsize=(10, 7)

)


plt.barh(

    top_features[

        "feature"

    ],

    top_features[

        "importance"

    ]

)


plt.xlabel(

    "Feature Importance"

)


plt.ylabel(

    "Feature"

)


plt.title(

    "COCOON Random Forest Feature Importance"

)


plt.tight_layout()


plt.savefig(

    "results/feature_importance.png",

    dpi=300

)


plt.show()