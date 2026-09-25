"""
weather.py

Loads local weather files and fetches
real hourly weather data from NASA POWER.
"""


from datetime import datetime

import pandas as pd

import requests


NASA_POWER_URL = (
    "https://power.larc.nasa.gov/api/temporal/hourly/point"
)


# ==================================================
# CLEAN WEATHER DATA
# ==================================================

def clean_weather_data(weather):

    weather = weather.copy()


    required_columns = [

        "timestamp",

        "temperature_C",

        "solar_radiation_W_m2"

    ]


    for column in required_columns:

        if column not in weather.columns:

            raise ValueError(

                f"Required column missing: {column}"

            )


    # ==============================================
    # TIMESTAMP
    # ==============================================

    weather["timestamp"] = pd.to_datetime(

        weather["timestamp"],

        errors="coerce"

    )


    # ==============================================
    # NUMERIC COLUMNS
    # ==============================================

    numeric_columns = [

        "temperature_C",

        "solar_radiation_W_m2",

        "wind_speed_m_s",

        "humidity_percent",

        "earth_skin_temperature_C"

    ]


    for column in numeric_columns:

        if column in weather.columns:

            weather[column] = pd.to_numeric(

                weather[column],

                errors="coerce"

            )


            weather[column] = weather[column].replace(

                [

                    -999,

                    -999.0,

                    -9999,

                    -1000

                ],

                pd.NA

            )


    # ==============================================
    # PHYSICAL VALIDATION
    # ==============================================

    weather.loc[

        weather["temperature_C"] < -100,

        "temperature_C"

    ] = pd.NA


    weather.loc[

        weather["temperature_C"] > 70,

        "temperature_C"

    ] = pd.NA


    weather.loc[

        weather["solar_radiation_W_m2"] < 0,

        "solar_radiation_W_m2"

    ] = pd.NA


    if "wind_speed_m_s" in weather.columns:

        weather.loc[

            weather["wind_speed_m_s"] < 0,

            "wind_speed_m_s"

        ] = pd.NA


    if "humidity_percent" in weather.columns:

        weather.loc[

            weather["humidity_percent"] < 0,

            "humidity_percent"

        ] = pd.NA


        weather.loc[

            weather["humidity_percent"] > 100,

            "humidity_percent"

        ] = pd.NA


    # ==============================================
    # REMOVE INVALID CORE RECORDS
    # ==============================================

    weather = weather.dropna(

        subset=[

            "timestamp",

            "temperature_C",

            "solar_radiation_W_m2"

        ]

    )


    # ==============================================
    # SORT
    # ==============================================

    weather = weather.sort_values(

        "timestamp"

    )


    weather = weather.reset_index(

        drop=True

    )


    if len(weather) == 0:

        raise ValueError(

            "No valid weather records available "
            "for the selected location and period."

        )


    return weather


# ==================================================
# LOAD LOCAL WEATHER CSV
# ==================================================

def load_weather_data(filepath):

    weather = pd.read_csv(

        filepath

    )


    return clean_weather_data(

        weather

    )


# ==================================================
# FETCH NASA POWER DATA
# ==================================================

def fetch_nasa_power_weather(

    latitude,

    longitude,

    start_date,

    end_date

):


    start_dt = datetime.strptime(

        start_date,

        "%Y%m%d"

    )


    end_dt = datetime.strptime(

        end_date,

        "%Y%m%d"

    )


    if end_dt < start_dt:

        raise ValueError(

            "End date cannot be before start date."

        )


    parameters = (

        "T2M,"
        "ALLSKY_SFC_SW_DWN,"
        "WS10M,"
        "RH2M,"
        "TS"

    )


    request_params = {

        "parameters":

            parameters,

        "community":

            "RE",

        "longitude":

            longitude,

        "latitude":

            latitude,

        "start":

            start_date,

        "end":

            end_date,

        "format":

            "JSON",

        "time-standard":

            "LST"

    }


    response = requests.get(

        NASA_POWER_URL,

        params=request_params,

        timeout=60

    )


    response.raise_for_status()


    data = response.json()


    if "properties" not in data:

        raise ValueError(

            "Unexpected NASA POWER response."

        )


    parameters_data = (

        data["properties"]

        .get(

            "parameter",

            {}

        )

    )


    if not parameters_data:

        raise ValueError(

            "NASA POWER returned no parameter data."

        )


    # ==============================================
    # BUILD TIMESTAMP INDEX
    # ==============================================

    timestamps = set()


    for parameter_values in parameters_data.values():

        timestamps.update(

            parameter_values.keys()

        )


    timestamps = sorted(

        timestamps

    )


    records = []


    for timestamp_key in timestamps:


        try:

            timestamp = pd.to_datetime(

                timestamp_key,

                format="%Y%m%d%H"

            )


        except ValueError:

            continue


        records.append({

            "timestamp":

                timestamp,


            "temperature_C":

                parameters_data

                .get(

                    "T2M",

                    {}

                )

                .get(

                    timestamp_key

                ),


            "solar_radiation_W_m2":

                parameters_data

                .get(

                    "ALLSKY_SFC_SW_DWN",

                    {}

                )

                .get(

                    timestamp_key

                ),


            "wind_speed_m_s":

                parameters_data

                .get(

                    "WS10M",

                    {}

                )

                .get(

                    timestamp_key

                ),


            "humidity_percent":

                parameters_data

                .get(

                    "RH2M",

                    {}

                )

                .get(

                    timestamp_key

                ),


            "earth_skin_temperature_C":

                parameters_data

                .get(

                    "TS",

                    {}

                )

                .get(

                    timestamp_key

                )

        })


    weather = pd.DataFrame(

        records

    )


    weather = clean_weather_data(

        weather

    )


    return weather