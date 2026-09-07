"""
ansys_export.py

Exports weather boundary data
for the ANSYS simulation team.
"""

import pandas as pd


def export_ansys_boundary_conditions(

    results_df,

    filepath

):


    ansys_data = pd.DataFrame({

        "timestamp":

            results_df[
                "timestamp"
            ],


        "outdoor_temperature_C":

            results_df[
                "outdoor_temperature_C"
            ],


        "solar_radiation_W_m2":

            results_df[
                "solar_radiation_W_m2"
            ]

    })


    ansys_data.to_csv(

        filepath,

        index=False

    )


    print(

        f"\nANSYS boundary data exported to:\n"
        f"{filepath}"

    )