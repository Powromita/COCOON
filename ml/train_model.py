"""
ml/train_model.py

Trains the COCOON Random Forest
thermal prediction model.
"""


import os

import pandas as pd

import joblib


from sklearn.model_selection import (

    train_test_split

)


from sklearn.ensemble import (

    RandomForestRegressor

)


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
# CREATE MODELS DIRECTORY
# ==================================================

os.makedirs(

    "models",

    exist_ok=True

)


# ==================================================
# LOAD DATASET
# ==================================================

print(

    "\nLoading ML dataset..."

)


dataset = pd.read_csv(

    DATASET_FILE

)


# ==================================================
# REMOVE TIMESTAMP
# ==================================================

dataset = dataset.drop(

    columns=[

        "timestamp"

    ],

    errors="ignore"

)


# ==================================================
# TARGET
# ==================================================

TARGET = (

    "target_indoor_temperature_C"

)


# ==================================================
# FEATURES
# ==================================================

X = dataset.drop(

    columns=[

        TARGET

    ]

)


y = dataset[

    TARGET

]


# ==================================================
# TRAIN TEST SPLIT
# ==================================================

X_train, X_test, y_train, y_test = (

    train_test_split(

        X,

        y,

        test_size=0.2,

        random_state=42

    )

)


# ==================================================
# RANDOM FOREST
# ==================================================

print(

    "Training Random Forest..."

)


model = (

    RandomForestRegressor(

        n_estimators=200,

        max_depth=None,

        min_samples_split=2,

        min_samples_leaf=1,

        random_state=42,

        n_jobs=-1

    )

)


model.fit(

    X_train,

    y_train

)


# ==================================================
# PREDICTIONS
# ==================================================

predictions = (

    model.predict(

        X_test

    )

)


# ==================================================
# METRICS
# ==================================================

mae = (

    mean_absolute_error(

        y_test,

        predictions

    )

)


rmse = (

    mean_squared_error(

        y_test,

        predictions

    )

    ** 0.5

)


r2 = (

    r2_score(

        y_test,

        predictions

    )

)


# ==================================================
# SAVE MODEL
# ==================================================

joblib.dump(

    model,

    MODEL_FILE

)


joblib.dump(

    list(

        X.columns

    ),

    FEATURE_FILE

)


# ==================================================
# PRINT RESULTS
# ==================================================

print()

print(

    "=" * 60

)


print(

    "COCOON RANDOM FOREST MODEL"

)


print(

    "=" * 60

)


print(

    f"\nTraining samples: "

    f"{len(X_train)}"

)


print(

    f"Testing samples: "

    f"{len(X_test)}"

)


print(

    f"Number of features: "

    f"{len(X.columns)}"

)


print()

print(

    f"MAE: "

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


print()

print(

    f"Model saved to: "

    f"{MODEL_FILE}"

)