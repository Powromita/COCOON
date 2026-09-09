"""
heat_flow_analysis.py

Post-processing helpers for the envelope heat-loss side of the RC
transient thermal model -- the mirror image of ``solar_analysis.py``.
Consumes the hourly results table written by ``main.py``
(``results/thermal_results.csv``) and turns the per-surface loss
columns (``Q_wall_W``, ``Q_roof_W``, ``Q_floor_W``, ``Q_window_W``)
into daily loss totals, a set of reporting metrics, and a
three-panel figure.

Sign convention (inherited from ``thermal_model``): a positive
``Q_*_W`` is heat *leaving* the shelter through that surface. A
negative value is a net gain through that surface -- most commonly the
floor, when the indoor air drops below the ground temperature.

Public functions
----------------
calculate_daily_heat_loss(results_df, unit='Wh')
    Hourly per-surface loss -> daily totals (DataFrame indexed by date).
calculate_heat_flow_metrics(results_df)
    Ten summary metrics for the heat-loss section of a report (dict).
plot_heat_flow_analysis(results_df, daily_loss_df, output_file)
    Hourly-stacked / daily-stacked / pie figure saved as PNG.
print_heat_flow_report(metrics)
    Pretty-print the metrics dict to the console.

Example
-------
>>> import pandas as pd
>>> from heat_flow_analysis import (
...     calculate_daily_heat_loss,
...     calculate_heat_flow_metrics,
...     plot_heat_flow_analysis,
...     print_heat_flow_report,
... )
>>> results_df = pd.read_csv("results/thermal_results.csv")
>>> daily_loss = calculate_daily_heat_loss(results_df, unit="Wh")
>>> metrics = calculate_heat_flow_metrics(results_df)
>>> print_heat_flow_report(metrics)
>>> plot_heat_flow_analysis(results_df, daily_loss, "results/heat_flow_analysis.png")
"""

import os

import numpy as np
import pandas as pd

import matplotlib

matplotlib.use("Agg")  # headless-safe: this module only ever writes files

import matplotlib.pyplot as plt
import matplotlib.dates as mdates

from matplotlib.dates import DateFormatter


# ==================================================
# CONSTANTS
# ==================================================

WH_PER_MJ = 0.0036          # 1 Wh = 0.0036 MJ
HOURS_PER_ROW = 1.0         # each results row is exactly one hour

_VALID_ENERGY_UNITS = ("Wh", "MJ")

# heat-flow-path key -> (results_df column, legend label, plot colour)
SURFACE_STYLE = {
    "wall":         ("Q_wall_W",         "Walls",        "#d62728"),   # red
    "roof":         ("Q_roof_W",         "Roof",         "#1f77b4"),   # blue
    "floor":        ("Q_floor_W",        "Floor",        "#8c564b"),   # brown
    "window":       ("Q_window_W",       "Windows",      "#17becf"),   # cyan
    "infiltration": ("Q_infiltration_W", "Infiltration", "#9467bd"),   # purple
}

# wall/roof/floor must be present; window and infiltration default to 0
# when their column is absent (windowless shelter, or a results file
# produced before infiltration was added to the model).
_CORE_SURFACES = ("wall", "roof", "floor")

# indoor / outdoor temperature columns, with the fallbacks used across
# the codebase and the schematic tables in the task spec.
_OUTDOOR_COLS = ("outdoor_temperature_C", "T_outdoor", "T_out_C")
_INDOOR_COLS = ("indoor_temperature_C", "T_indoor", "T_in_C")


# ==================================================
# INTERNAL HELPERS
# ==================================================

def _ensure_datetime(
    results_df: pd.DataFrame,
    column: str = "timestamp",
) -> pd.DataFrame:
    """Return a copy of ``results_df`` with ``column`` guaranteed to be
    ``datetime64``.

    Raises
    ------
    KeyError
        If ``column`` is absent.
    ValueError
        If the column cannot be parsed to datetime.
    """

    if column not in results_df.columns:

        raise KeyError(
            f"results_df is missing the required '{column}' column. "
            f"Columns present: {list(results_df.columns)}"
        )

    df = results_df.copy()

    if not pd.api.types.is_datetime64_any_dtype(df[column]):

        try:
            df[column] = pd.to_datetime(df[column], errors="raise")

        except (ValueError, TypeError) as exc:

            raise ValueError(
                f"Could not parse the '{column}' column as datetime: {exc}"
            ) from exc

    if len(df) > 0 and df[column].isna().all():

        raise ValueError(
            f"The '{column}' column contains no parseable datetimes."
        )

    return df


def _clean_series(values: pd.Series) -> pd.Series:
    """Coerce to numeric, replace NaN with 0.0, return a float Series.

    A missing hour is treated as zero flux rather than dropped so daily
    and cumulative totals stay aligned to the calendar.
    """

    return (
        pd.to_numeric(values, errors="coerce")
        .fillna(0.0)
        .astype(float)
    )


def _surface_frame(results_df: pd.DataFrame) -> pd.DataFrame:
    """Return a float DataFrame with one column per surface key
    (``wall``, ``roof``, ``floor``, ``window``).

    ``wall``/``roof``/``floor`` are required; ``window`` is filled with
    zeros when the column is absent.

    Raises
    ------
    KeyError
        If any of the core surface columns is missing.
    """

    missing = [
        SURFACE_STYLE[key][0]
        for key in _CORE_SURFACES
        if SURFACE_STYLE[key][0] not in results_df.columns
    ]

    if missing:

        raise KeyError(
            "results_df is missing required surface heat-loss "
            f"column(s): {missing}. Expected the per-surface columns "
            "written by thermal_model "
            "(Q_wall_W, Q_roof_W, Q_floor_W, Q_window_W). "
            f"Columns present: {list(results_df.columns)}"
        )

    data = {}

    for key, (column, _label, _colour) in SURFACE_STYLE.items():

        if column in results_df.columns:
            data[key] = _clean_series(results_df[column])
        else:
            # windowless shelter -> no Q_window_W column
            data[key] = pd.Series(0.0, index=results_df.index)

    return pd.DataFrame(data)


def _temperature_difference(results_df: pd.DataFrame):
    """Return the hourly indoor-minus-outdoor temperature difference as a
    numeric Series, or ``None`` if either temperature column is absent.
    """

    outdoor_col = next(
        (c for c in _OUTDOOR_COLS if c in results_df.columns), None
    )
    indoor_col = next(
        (c for c in _INDOOR_COLS if c in results_df.columns), None
    )

    if outdoor_col is None or indoor_col is None:
        return None

    t_out = pd.to_numeric(results_df[outdoor_col], errors="coerce")
    t_in = pd.to_numeric(results_df[indoor_col], errors="coerce")

    return t_in - t_out


# ==================================================
# FUNCTION 1 - DAILY HEAT LOSS
# ==================================================

def calculate_daily_heat_loss(
    results_df: pd.DataFrame,
    unit: str = "Wh",
) -> pd.DataFrame:
    """Aggregate hourly per-surface heat loss into daily totals.

    Each row of ``results_df`` is assumed to be exactly one hour, so the
    daily loss in Watt-hours through a surface is simply the sum of that
    surface's hourly ``Q_*_W`` values for the calendar day.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table. Must contain:

        * ``timestamp`` -- datetime or parseable string, one row per hour.
        * ``Q_wall_W``, ``Q_roof_W``, ``Q_floor_W`` -- per-surface heat
          loss in Watts (positive = heat leaving the shelter).
        * ``Q_window_W`` -- optional; treated as ``0`` if absent
          (windowless shelter).
    unit : {'Wh', 'MJ'}, optional
        Output unit. ``'Wh'`` (default) or ``'MJ'`` (1 Wh = 0.0036 MJ).

    Returns
    -------
    pandas.DataFrame
        Indexed by ``datetime.date`` (index name ``"date"``), one row per
        calendar day present in the input. Columns, in order:

        ``wall_loss_<unit>``, ``roof_loss_<unit>``, ``floor_loss_<unit>``,
        ``window_loss_<unit>``, ``total_loss_<unit>``

        where ``total_loss`` is the row-wise sum of the four surfaces. An
        empty input returns an empty DataFrame with those columns.

    Raises
    ------
    TypeError
        If ``results_df`` is not a pandas DataFrame.
    KeyError
        If ``timestamp`` or any core surface column is missing.
    ValueError
        If ``unit`` is invalid or the timestamps cannot be parsed.

    Notes
    -----
    * ``NaN`` fluxes are treated as ``0`` W.
    * Negative values are summed as-is (a negative daily total means that
      surface was a net heat *source* over the day, e.g. the floor when
      indoor air fell below ground temperature).
    * Partial days at the period edges are returned as-is.

    Examples
    --------
    >>> df = pd.DataFrame({
    ...     "timestamp": pd.date_range("2024-01-12", periods=24, freq="h"),
    ...     "Q_wall_W": [200.0] * 24,
    ...     "Q_roof_W": [300.0] * 24,
    ...     "Q_floor_W": [100.0] * 24,
    ...     "Q_window_W": [50.0] * 24,
    ... })
    >>> calculate_daily_heat_loss(df, unit="Wh").loc[:, "total_loss_Wh"]
    date
    2024-01-12    15600.0
    Name: total_loss_Wh, dtype: float64
    """

    if not isinstance(results_df, pd.DataFrame):

        raise TypeError(
            "results_df must be a pandas DataFrame, got "
            f"{type(results_df).__name__}"
        )

    if unit not in _VALID_ENERGY_UNITS:

        raise ValueError(
            f"unit must be one of {_VALID_ENERGY_UNITS}, got {unit!r}"
        )

    path_keys = list(SURFACE_STYLE.keys())
    columns = [f"{k}_loss_{unit}" for k in path_keys] + [f"total_loss_{unit}"]

    # Empty input -> empty, correctly-shaped DataFrame.
    if len(results_df) == 0:

        empty = pd.DataFrame(columns=columns, dtype="float64")
        empty.index.name = "date"
        return empty

    df = _ensure_datetime(results_df, "timestamp")

    surfaces = _surface_frame(df)          # wall, roof, floor, window, infiltration
    surfaces["_date"] = df["timestamp"].dt.date

    # 1 row == 1 hour, so summed Watts == Watt-hours.
    daily_wh = (
        surfaces.groupby("_date").sum(numeric_only=True).sort_index()
    )

    scale = WH_PER_MJ if unit == "MJ" else 1.0

    out = pd.DataFrame(index=daily_wh.index)
    for key in path_keys:
        out[f"{key}_loss_{unit}"] = daily_wh[key] * scale
    out[f"total_loss_{unit}"] = out.sum(axis=1)

    out.index.name = "date"

    return out.astype(float)


# ==================================================
# FUNCTION 2 - HEAT FLOW METRICS
# ==================================================

def calculate_heat_flow_metrics(results_df: pd.DataFrame) -> dict:
    """Compute ten summary metrics for the heat-loss section of a report.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table. Columns used:

        * ``Q_wall_W``, ``Q_roof_W``, ``Q_floor_W`` -- **required**.
        * ``Q_window_W`` -- optional (treated as 0 if absent).
        * ``outdoor_temperature_C`` / ``indoor_temperature_C`` -- optional
          (the two temperature-difference metrics are ``NaN`` without
          both). ``T_outdoor`` / ``T_indoor`` are accepted as aliases.

    Returns
    -------
    dict
        Dictionary with exactly these ten float keys:

        ``total_heat_loss_Wh``
            Sum of the four surface losses over the whole period [Wh].
        ``total_heat_loss_MJ``
            Same total in MJ (``* 0.0036``).
        ``peak_hourly_loss_W``
            Largest single-hour envelope loss
            (max over hours of ``wall + roof + floor + window``).
        ``avg_hourly_loss_W``
            Mean hourly envelope loss (``total_heat_loss_Wh / n_hours``).
        ``wall_fraction_percent``, ``roof_fraction_percent``,
        ``floor_fraction_percent``, ``window_fraction_percent``
            Each surface's period-summed loss as a percentage of the
            grand total. The four values sum to 100 (a surface with a net
            gain over the period contributes a negative percentage).
        ``peak_temp_difference_C``
            Maximum hourly ``indoor - outdoor`` temperature difference
            -- the worst-case driving force for loss.
        ``avg_temp_difference_C``
            Mean hourly ``indoor - outdoor`` difference.

    Raises
    ------
    TypeError
        If ``results_df`` is not a pandas DataFrame.
    KeyError
        If any core surface column is missing.

    Notes
    -----
    * An empty DataFrame returns all ten keys as ``NaN``.
    * If the period-summed grand total is zero, the four fraction metrics
      are ``NaN`` (undefined).
    * Missing temperature columns null only the two ``*_temp_difference``
      metrics.

    Examples
    --------
    >>> df = pd.DataFrame({
    ...     "Q_wall_W":   [200, 100, 50],
    ...     "Q_roof_W":   [300, 150, 60],
    ...     "Q_floor_W":  [100,  60, 20],
    ...     "Q_window_W": [ 50,  30, 10],
    ...     "outdoor_temperature_C": [-20, -10, 0],
    ...     "indoor_temperature_C":  [-8,   -3, 2],
    ... })
    >>> m = calculate_heat_flow_metrics(df)
    >>> round(m["total_heat_loss_Wh"], 1)
    1420.0
    """

    keys = (
        "total_heat_loss_Wh",
        "total_heat_loss_MJ",
        "peak_hourly_loss_W",
        "avg_hourly_loss_W",
        "wall_fraction_percent",
        "roof_fraction_percent",
        "floor_fraction_percent",
        "window_fraction_percent",
        "infiltration_fraction_percent",
        "peak_temp_difference_C",
        "avg_temp_difference_C",
    )

    metrics = {key: float("nan") for key in keys}

    if not isinstance(results_df, pd.DataFrame):

        raise TypeError(
            "results_df must be a pandas DataFrame, got "
            f"{type(results_df).__name__}"
        )

    # Empty input -> all-NaN dict (documented contract). Validate the
    # surface columns first so a malformed frame still raises.
    surfaces = _surface_frame(results_df)

    if len(results_df) == 0:
        return metrics

    n_hours = len(results_df)

    hourly_total = surfaces.sum(axis=1)          # per-hour envelope loss
    surface_sums = surfaces.sum(axis=0)          # per-surface period total
    grand_total = float(surface_sums.sum())

    # --- Metrics 1 & 10: total energy ------------------------------
    metrics["total_heat_loss_Wh"] = grand_total          # 1 row == 1 h
    metrics["total_heat_loss_MJ"] = grand_total * WH_PER_MJ

    # --- Metric 2: peak single-hour loss --------------------------
    metrics["peak_hourly_loss_W"] = float(hourly_total.max())

    # --- Metric 3: average hourly loss ---------------------------
    metrics["avg_hourly_loss_W"] = grand_total / n_hours

    # --- per-path fractions of the period total -----------------
    if grand_total != 0:
        for key in SURFACE_STYLE:
            metrics[f"{key}_fraction_percent"] = (
                float(surface_sums[key]) / grand_total * 100.0
            )

    # --- Metrics 8-9: indoor-minus-outdoor temperature difference -
    delta_t = _temperature_difference(results_df)

    if delta_t is not None and delta_t.notna().any():
        metrics["peak_temp_difference_C"] = float(delta_t.max())
        metrics["avg_temp_difference_C"] = float(delta_t.mean())

    return metrics


# ==================================================
# FUNCTION 3 - THREE-PANEL FIGURE
# ==================================================

def plot_heat_flow_analysis(
    results_df: pd.DataFrame,
    daily_loss_df: pd.DataFrame,
    output_file: str,
) -> None:
    """Render a three-panel envelope heat-loss figure and save it as PNG.

    The panels, top to bottom:

    1. **Hourly Heat Loss by Surface** -- stacked area of the four
       surface losses against time; shows loss spiking at night (large
       indoor-outdoor difference) and collapsing during the day.
    2. **Daily Heat Loss by Surface** -- stacked bars from
       ``daily_loss_df``, one bar per day.
    3. **Heat Loss Distribution** -- pie chart of each surface's share of
       the period total, so the dominant loss path is obvious.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table. Must contain ``timestamp`` and the core
        surface columns (``Q_wall_W``, ``Q_roof_W``, ``Q_floor_W``);
        ``Q_window_W`` is optional.
    daily_loss_df : pandas.DataFrame
        Output of :func:`calculate_daily_heat_loss` -- index is dates,
        columns are the per-surface and total daily losses. The column
        suffix (``_Wh`` / ``_MJ``) sets the middle panel's y-axis label.
    output_file : str
        Path to write the PNG to, e.g. ``"results/heat_flow_analysis.png"``.
        Parent directories are created if missing.

    Returns
    -------
    None

    Raises
    ------
    TypeError
        If ``results_df`` / ``daily_loss_df`` are the wrong type.
    KeyError
        If ``timestamp`` or a core surface column is missing.
    OSError
        If ``output_file`` cannot be written.

    Notes
    -----
    * Figure is 14 x 10 inches at 300 DPI.
    * The figure is always closed before returning (safe in a loop).
    * An empty ``results_df`` still produces a valid (empty) figure.
    * The pie panel is skipped with an explanatory note if the period
      total loss is not positive.
    """

    # --- input validation -----------------------------------------
    if not isinstance(results_df, pd.DataFrame):

        raise TypeError(
            "results_df must be a pandas DataFrame, got "
            f"{type(results_df).__name__}"
        )

    if not isinstance(daily_loss_df, pd.DataFrame):

        raise TypeError(
            "daily_loss_df must be a pandas DataFrame (the output of "
            "calculate_daily_heat_loss), got "
            f"{type(daily_loss_df).__name__}"
        )

    if "timestamp" not in results_df.columns:

        raise KeyError(
            "results_df is missing the required 'timestamp' column. "
            f"Columns present: {list(results_df.columns)}"
        )

    # --- make sure the output directory exists --------------------
    out_dir = os.path.dirname(os.path.abspath(output_file))

    try:
        os.makedirs(out_dir, exist_ok=True)

    except OSError as exc:

        raise OSError(
            f"Could not create the output directory {out_dir!r} for "
            f"{output_file!r}: {exc}. Pass a path whose parent folder is "
            f"writable."
        ) from exc

    # --- prepare the data ---------------------------------------
    df = _ensure_datetime(results_df, "timestamp")
    surfaces = _surface_frame(df)          # raises KeyError if core cols missing

    unit = "Wh"
    for col in daily_loss_df.columns:
        if str(col).endswith("_MJ"):
            unit = "MJ"
            break

    title_kw = {"fontsize": 12, "fontweight": "bold"}
    label_kw = {"fontsize": 11, "fontweight": "bold"}

    surface_keys = list(SURFACE_STYLE.keys())
    labels = [SURFACE_STYLE[k][1] for k in surface_keys]
    colours = [SURFACE_STYLE[k][2] for k in surface_keys]

    fig, (ax_hourly, ax_daily, ax_pie) = plt.subplots(
        nrows=3,
        ncols=1,
        figsize=(14, 10),
    )

    try:
        # =======================================================
        # PANEL 1 - hourly heat loss by surface (stacked area)
        # =======================================================
        if len(df) > 0:

            ax_hourly.stackplot(
                df["timestamp"],
                *[surfaces[k].to_numpy() for k in surface_keys],
                labels=labels,
                colors=colours,
                alpha=0.85,
            )
            ax_hourly.xaxis.set_major_formatter(
                DateFormatter("%m-%d %H:%M")
            )
            ax_hourly.xaxis.set_major_locator(mdates.AutoDateLocator())

        ax_hourly.set_title(
            "Hourly Heat Loss by Surface", **title_kw
        )
        ax_hourly.set_xlabel("Time", **label_kw)
        ax_hourly.set_ylabel("Heat loss [W]", **label_kw)
        ax_hourly.grid(True, alpha=0.3)
        ax_hourly.legend(loc="upper right", ncol=4)

        # =======================================================
        # PANEL 2 - daily heat loss by surface (stacked bars)
        # =======================================================
        per_surface_cols = [
            f"{k}_loss_{unit}"
            for k in surface_keys
            if f"{k}_loss_{unit}" in daily_loss_df.columns
        ]

        if len(daily_loss_df) > 0 and per_surface_cols:

            x_labels = [str(d) for d in daily_loss_df.index]
            bottom = np.zeros(len(daily_loss_df))

            for key in surface_keys:

                col = f"{key}_loss_{unit}"
                if col not in daily_loss_df.columns:
                    continue

                values = daily_loss_df[col].to_numpy(dtype=float)
                ax_daily.bar(
                    x_labels,
                    values,
                    bottom=bottom,
                    color=SURFACE_STYLE[key][2],
                    edgecolor="black",
                    linewidth=0.5,
                    label=SURFACE_STYLE[key][1],
                )
                bottom = bottom + values

        ax_daily.set_title("Daily Heat Loss by Surface", **title_kw)
        ax_daily.set_xlabel("Date", **label_kw)
        ax_daily.set_ylabel(f"Daily heat loss [{unit}]", **label_kw)
        ax_daily.grid(True, alpha=0.3, axis="y")
        ax_daily.legend(loc="upper left", ncol=4)

        for tick in ax_daily.get_xticklabels():
            tick.set_rotation(45)
            tick.set_horizontalalignment("right")

        # =======================================================
        # PANEL 3 - heat loss distribution (pie)
        # =======================================================
        surface_sums = surfaces.sum(axis=0)
        # Clip tiny net-gain surfaces to 0 so the pie stays well defined;
        # the exact signed split lives in the metrics dict.
        pie_values = surface_sums.clip(lower=0.0)

        if float(pie_values.sum()) > 0:

            ax_pie.pie(
                [float(pie_values[k]) for k in surface_keys],
                labels=labels,
                colors=colours,
                autopct="%1.1f%%",
                startangle=90,
                wedgeprops={"edgecolor": "white", "linewidth": 1.0},
            )
            ax_pie.axis("equal")
        else:
            ax_pie.text(
                0.5, 0.5,
                "No net envelope loss over the period",
                ha="center", va="center", transform=ax_pie.transAxes,
            )
            ax_pie.axis("off")

        ax_pie.set_title(
            "Heat Loss Distribution (period total)", **title_kw
        )

        # Rotate the datetime tick labels on the time-axis panel.
        for tick in ax_hourly.get_xticklabels():
            tick.set_rotation(45)
            tick.set_horizontalalignment("right")

        fig.tight_layout()

        try:
            fig.savefig(output_file, dpi=300, bbox_inches="tight")

        except OSError as exc:

            raise OSError(
                f"Failed to write the figure to {output_file!r}: {exc}. "
                f"Check the path and write permissions."
            ) from exc

    finally:
        plt.close(fig)

    return None


# ==================================================
# CONSOLE REPORT HELPER
# ==================================================

def print_heat_flow_report(metrics: dict) -> None:
    """Pretty-print the :func:`calculate_heat_flow_metrics` dict.

    Parameters
    ----------
    metrics : dict
        The ten-key dictionary returned by
        :func:`calculate_heat_flow_metrics`.

    Returns
    -------
    None
    """

    def _fmt(value: float, spec: str) -> str:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return "n/a"
        return format(value, spec)

    line = "=" * 61

    print(line)
    print("HEAT FLOW ANALYSIS")
    print(line)
    print()
    print(
        f"Total heat loss (period): "
        f"{_fmt(metrics.get('total_heat_loss_Wh'), ',.0f')} Wh = "
        f"{_fmt(metrics.get('total_heat_loss_MJ'), ',.2f')} MJ"
    )
    print(
        f"Peak hourly loss: "
        f"{_fmt(metrics.get('peak_hourly_loss_W'), ',.0f')} W"
    )
    print(
        f"Average hourly loss: "
        f"{_fmt(metrics.get('avg_hourly_loss_W'), ',.0f')} W"
    )
    print()
    print("Heat loss by path:")
    print(f"  Walls:        {_fmt(metrics.get('wall_fraction_percent'), '.1f')} %")
    print(f"  Roof:         {_fmt(metrics.get('roof_fraction_percent'), '.1f')} %")
    print(f"  Floor:        {_fmt(metrics.get('floor_fraction_percent'), '.1f')} %")
    print(f"  Windows:      {_fmt(metrics.get('window_fraction_percent'), '.1f')} %")
    print(f"  Infiltration: {_fmt(metrics.get('infiltration_fraction_percent'), '.1f')} %")
    print()
    print(
        f"Peak temperature difference: "
        f"{_fmt(metrics.get('peak_temp_difference_C'), '.1f')} degC"
    )
    print(
        f"Average temperature difference: "
        f"{_fmt(metrics.get('avg_temp_difference_C'), '.2f')} degC"
    )
    print()


# ==================================================
# SELF-TEST / DEMO
# ==================================================

def _self_test() -> None:
    """Exercise the functions on synthetic data.

    Run with ``python heat_flow_analysis.py``.
    """

    # --- Function 1: 24 h, constant per-surface losses -------------
    df_const = pd.DataFrame(
        {
            "timestamp": pd.date_range(
                "2024-01-12", periods=24, freq="h"
            ),
            "Q_wall_W": [200.0] * 24,
            "Q_roof_W": [300.0] * 24,
            "Q_floor_W": [100.0] * 24,
            "Q_window_W": [50.0] * 24,
        }
    )
    daily = calculate_daily_heat_loss(df_const, unit="Wh")
    assert list(daily.columns) == [
        "wall_loss_Wh", "roof_loss_Wh", "floor_loss_Wh",
        "window_loss_Wh", "infiltration_loss_Wh", "total_loss_Wh",
    ]
    assert abs(daily["total_loss_Wh"].iloc[0] - 15600.0) < 1e-6
    assert abs(daily["roof_loss_Wh"].iloc[0] - 7200.0) < 1e-6
    assert daily["infiltration_loss_Wh"].iloc[0] == 0.0

    # MJ conversion
    daily_mj = calculate_daily_heat_loss(df_const, unit="MJ")
    assert abs(daily_mj["total_loss_MJ"].iloc[0] - 15600.0 * 0.0036) < 1e-9

    # windowless shelter (no Q_window_W column)
    df_nowin = df_const.drop(columns=["Q_window_W"])
    daily_nw = calculate_daily_heat_loss(df_nowin, unit="Wh")
    assert daily_nw["window_loss_Wh"].iloc[0] == 0.0
    assert abs(daily_nw["total_loss_Wh"].iloc[0] - 14400.0) < 1e-6

    # --- Function 2: 48 h of varying loss --------------------------
    hours = pd.date_range("2024-01-12", periods=48, freq="h")
    # cold at night, mild by day -> loss tracks the temperature swing
    t_out = -12.0 + 14.0 * np.sin(np.linspace(-np.pi / 2, 3.5 * np.pi, 48))
    t_in = np.full(48, 5.0)
    delta = np.clip(t_in - t_out, 0, None)

    df_var = pd.DataFrame(
        {
            "timestamp": hours,
            "Q_wall_W": 12.0 * delta,
            "Q_roof_W": 16.0 * delta,
            "Q_floor_W": 6.0 * delta,
            "Q_window_W": 4.0 * delta,
            "outdoor_temperature_C": t_out,
            "indoor_temperature_C": t_in,
        }
    )

    metrics = calculate_heat_flow_metrics(df_var)
    assert set(metrics) == {
        "total_heat_loss_Wh", "total_heat_loss_MJ",
        "peak_hourly_loss_W", "avg_hourly_loss_W",
        "wall_fraction_percent", "roof_fraction_percent",
        "floor_fraction_percent", "window_fraction_percent",
        "infiltration_fraction_percent",
        "peak_temp_difference_C", "avg_temp_difference_C",
    }
    for key, value in metrics.items():
        assert isinstance(value, float), (key, type(value))

    fractions = (
        metrics["wall_fraction_percent"]
        + metrics["roof_fraction_percent"]
        + metrics["floor_fraction_percent"]
        + metrics["window_fraction_percent"]
        + metrics["infiltration_fraction_percent"]
    )
    assert abs(fractions - 100.0) < 1e-6, fractions
    # loss coefficients 12/16/6/4 -> roof should dominate
    assert metrics["roof_fraction_percent"] > metrics["wall_fraction_percent"]

    # empty-input contract
    empty = calculate_heat_flow_metrics(
        pd.DataFrame(
            {"Q_wall_W": [], "Q_roof_W": [], "Q_floor_W": []}
        )
    )
    assert all(np.isnan(v) for v in empty.values())

    # missing core column -> KeyError
    try:
        calculate_heat_flow_metrics(pd.DataFrame({"Q_wall_W": [1.0]}))
        raise AssertionError("expected KeyError for missing surface cols")
    except KeyError:
        pass

    # --- Function 3: render the 3-panel figure --------------------
    out_path = os.path.join("results", "heat_flow_analysis_selftest.png")
    daily_var = calculate_daily_heat_loss(df_var, unit="Wh")
    plot_heat_flow_analysis(df_var, daily_var, out_path)
    assert os.path.isfile(out_path)

    print_heat_flow_report(metrics)
    print("heat_flow_analysis self-test: all checks passed")
    print(f"  daily total (const)            : "
          f"{daily['total_loss_Wh'].iloc[0]:.0f} Wh")
    print(f"  total loss (48 h synthetic)    : "
          f"{metrics['total_heat_loss_Wh']:.0f} Wh "
          f"({metrics['total_heat_loss_MJ']:.2f} MJ)")
    print(f"  peak / avg hourly loss         : "
          f"{metrics['peak_hourly_loss_W']:.0f} W / "
          f"{metrics['avg_hourly_loss_W']:.0f} W")
    print(f"  figure written to              : {out_path}")


if __name__ == "__main__":
    _self_test()
