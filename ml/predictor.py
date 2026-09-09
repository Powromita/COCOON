"""
ml/predictor.py

Loads the trained COCOON Random Forest model
and generates indoor temperature predictions.
"""


import os
import sys

import pandas as pd
import joblib


# ==================================================
# PROJECT ROOT
# ==================================================

PROJECT_ROOT = os.path.dirname(

    os.path.dirname(

        os.path.abspath(

            __file__

        )

    )

)


if PROJECT_ROOT not in sys.path:

    sys.path.insert(

        0,

        PROJECT_ROOT

    )


# ==================================================
# MODEL PATHS
# ==================================================

MODEL_FILE = os.path.join(

    PROJECT_ROOT,

    "models",

    "cocoon_random_forest.joblib"

)


FEATURE_FILE = os.path.join(

    PROJECT_ROOT,

    "models",

    "cocoon_features.joblib"

)


# ==================================================
# LOAD MODEL
# ==================================================

def load_ml_model():

    if not os.path.exists(

        MODEL_FILE

    ):

        raise FileNotFoundError(

            "Random Forest model not found.\n"

            f"Expected: {MODEL_FILE}\n"

            "Run: python ml/train_model.py"

        )


    if not os.path.exists(

        FEATURE_FILE

    ):

        raise FileNotFoundError(

            "ML feature list not found.\n"

            f"Expected: {FEATURE_FILE}"

        )


    model = joblib.load(

        MODEL_FILE

    )


    feature_names = joblib.load(

        FEATURE_FILE

    )


    return (

        model,

        feature_names

    )


# ==================================================
# SINGLE PREDICTION
# ==================================================

def predict_indoor_temperature(

    feature_data

):


    model, feature_names = (

        load_ml_model()

    )


    input_df = pd.DataFrame(

        [

            feature_data

        ]

    )


    missing_features = [

        feature

        for feature in feature_names

        if feature not in input_df.columns

    ]


    if missing_features:

        raise ValueError(

            "Missing ML features:\n"

            +

            "\n".join(

                missing_features

            )

        )


    input_df = input_df[

        feature_names

    ]


    prediction = model.predict(

        input_df

    )


    return float(

        prediction[0]

    )


# ==================================================
# MULTIPLE PREDICTIONS
# ==================================================

def predict_batch(

    feature_dataframe

):


    model, feature_names = (

        load_ml_model()

    )


    missing_features = [

        feature

        for feature in feature_names

        if feature not in feature_dataframe.columns

    ]


    if missing_features:

        raise ValueError(

            "Missing ML features:\n"

            +

            "\n".join(

                missing_features

            )

        )


    X = feature_dataframe[

        feature_names

    ]


    predictions = model.predict(

        X

    )


    return predictions