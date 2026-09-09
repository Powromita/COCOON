"""
solar_analysis.py

Post-processing helpers for the solar-gain side of the RC transient
thermal model. Consumes the hourly results table written by
``main.py`` (``results/thermal_results.csv``) and turns the
per-hour ``Q_solar_W`` column into daily energy totals, a small set
of reporting metrics, and a three-panel figure.

Public functions
----------------
calculate_daily_solar_energy(results_df, unit='Wh')
    Hourly solar power -> daily energy totals (Series indexed by date).
calculate_solar_metrics(results_df, configuration)
    Seven summary metrics for the solar section of a report (dict).
plot_solar_analysis(results_df, daily_energy_series, output_file)
    Hourly / daily / cumulative solar-energy figure saved as PNG.

Example
-------
>>> import pandas as pd
>>> from solar_analysis import (
...     calculate_daily_solar_energy,
...     calculate_solar_metrics,
...     plot_solar_analysis,
... )
>>> results_df = pd.read_csv("results/thermal_results.csv")
>>> config = {"windows": {"area_m2": 2.5, "SHGC": 0.70}}
>>> daily_energy = calculate_daily_solar_energy(results_df, unit="Wh")
>>> metrics = calculate_solar_metrics(results_df, config)
>>> plot_solar_analysis(results_df, daily_energy, "results/solar_analysis.png")
"""

import os

import numpy as np
import pandas as pd

from scipy.stats import pearsonr

import matplotlib

matplotlib.use("Agg")  # headless-safe: this module only ever writes files

import matplotlib.pyplot as plt
import matplotlib.dates as mdates

from matplotlib.dates import DateFormatter
from matplotlib.colors import Normalize


# ==================================================
# CONSTANTS
# ==================================================

# Each results row is exactly one hour, so summing W over N rows gives Wh.
WH_PER_MJ = 0.0036          # 1 Wh = 0.0036 MJ
HOURS_PER_ROW = 1.0

_VALID_ENERGY_UNITS = ("Wh", "MJ")


# ==================================================
# INTERNAL HELPERS
# ==================================================

def _ensure_datetime(
    results_df: pd.DataFrame,
    column: str = "timestamp",
) -> pd.DataFrame:
    """Return a copy of ``results_df`` with ``column`` guaranteed to be
    ``datetime64``.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table.
    column : str
        Name of the timestamp column (default ``"timestamp"``).

    Returns
    -------
    pandas.DataFrame
        Copy of the input with the timestamp column parsed to datetime.

    Raises
    ------
    KeyError
        If ``column`` is not present.
    ValueError
        If the column cannot be parsed to datetime, or every value
        fails to parse.
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
    """Coerce to numeric, replace NaN with 0.0 and return a float Series.

    Used for the hourly ``Q_solar_W`` column: missing hours are treated
    as zero solar gain rather than dropped, so daily and cumulative
    totals stay aligned to the calendar.
    """

    numeric = pd.to_numeric(values, errors="coerce")

    return numeric.fillna(0.0).astype(float)


def _resolve_aperture(configuration: dict) -> tuple:
    """Return ``(area_m2, shgc)`` for the solar aperture from a
    configuration dict, mirroring
    ``heat_transfer.resolve_solar_aperture`` so this module cannot drift
    from the model it post-processes.

    Resolution order:

    1. ``configuration["windows"]["area_m2"]`` / ``["SHGC"]``
    2. ``configuration["windows"]["eta_solar"]`` as an SHGC fallback
    3. legacy ``configuration["solar"]["area_m2"]`` / ``["eta_solar"]``

    Any value that cannot be found is returned as ``float("nan")`` so the
    caller can decide which metrics to null out rather than crashing.
    """

    windows = (configuration or {}).get("windows") or {}
    legacy = (configuration or {}).get("solar") or {}

    # --- area -------------------------------------------------------
    area = windows.get("area_m2")

    if area is None:
        area = legacy.get("area_m2")

    # --- SHGC (a.k.a. eta_solar) -----------------------------------
    shgc = windows.get("SHGC")

    if shgc is None:
        shgc = windows.get("eta_solar")

    if shgc is None:
        shgc = legacy.get("eta_solar")

    try:
        area = float(area) if area is not None else float("nan")
    except (TypeError, ValueError):
        area = float("nan")

    try:
        shgc = float(shgc) if shgc is not None else float("nan")
    except (TypeError, ValueError):
        shgc = float("nan")

    return area, shgc


# ==================================================
# FUNCTION 1 - DAILY SOLAR ENERGY
# ==================================================

def calculate_daily_solar_energy(
    results_df: pd.DataFrame,
    unit: str = "Wh",
) -> pd.Series:
    """Aggregate hourly solar power into daily energy totals.

    Each row of ``results_df`` is assumed to represent exactly one hour,
    so the daily energy in Watt-hours is simply the sum of the hourly
    ``Q_solar_W`` values for that calendar day.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table. Must contain:

        * ``timestamp`` -- datetime or parseable string, one row per hour.
        * ``Q_solar_W`` -- instantaneous solar thermal gain in Watts.
    unit : {'Wh', 'MJ'}, optional
        Output unit. ``'Wh'`` returns Watt-hours (default); ``'MJ'``
        returns Megajoules (1 Wh = 0.0036 MJ).

    Returns
    -------
    pandas.Series
        Indexed by ``datetime.date`` (one entry per calendar day that
        appears in the input), values are the daily solar energy totals
        in the requested unit. The Series is named
        ``"daily_solar_energy_<unit>"`` and sorted by date. An empty
        input returns an empty Series.

    Raises
    ------
    TypeError
        If ``results_df`` is not a pandas DataFrame.
    KeyError
        If the ``timestamp`` or ``Q_solar_W`` column is missing.
    ValueError
        If ``unit`` is not ``'Wh'`` or ``'MJ'``, or the timestamp column
        cannot be parsed to datetime.

    Notes
    -----
    * ``NaN`` values in ``Q_solar_W`` are treated as ``0`` W so that a
      missing hour does not drop the whole day.
    * Negative ``Q_solar_W`` values should not occur physically; they are
      summed as-is rather than clipped, so a data problem stays visible.
    * Partial days at the start/end of the period are returned as-is
      (they simply sum fewer than 24 hours).

    Examples
    --------
    >>> df = pd.DataFrame({
    ...     "timestamp": pd.date_range("2024-01-05", periods=24, freq="h"),
    ...     "Q_solar_W": [100.0] * 24,
    ... })
    >>> calculate_daily_solar_energy(df, unit="Wh")
    2024-01-05    2400.0
    Name: daily_solar_energy_Wh, dtype: float64
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

    if "Q_solar_W" not in results_df.columns:

        raise KeyError(
            "results_df is missing the required 'Q_solar_W' column. "
            f"Columns present: {list(results_df.columns)}"
        )

    # Empty input -> empty (but correctly typed and named) Series.
    if len(results_df) == 0:

        return pd.Series(
            dtype="float64",
            name=f"daily_solar_energy_{unit}",
        )

    df = _ensure_datetime(results_df, "timestamp")

    df["Q_solar_W"] = _clean_series(df["Q_solar_W"])

    # 1 row == 1 hour, so the hourly Wh value equals the W value.
    df["energy_Wh"] = df["Q_solar_W"] * HOURS_PER_ROW

    # Group on the calendar date (time-of-day stripped).
    daily_wh = (
        df.groupby(df["timestamp"].dt.date)["energy_Wh"]
        .sum()
        .sort_index()
    )

    if unit == "MJ":
        daily = daily_wh * WH_PER_MJ
    else:
        daily = daily_wh

    daily.name = f"daily_solar_energy_{unit}"
    daily.index.name = "date"

    return daily.astype(float)


# ==================================================
# FUNCTION 2 - SOLAR METRICS
# ==================================================

def calculate_solar_metrics(
    results_df: pd.DataFrame,
    configuration: dict,
) -> dict:
    """Compute seven summary metrics for the solar section of a report.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table. Columns used:

        * ``Q_solar_W`` -- solar thermal gain per hour [W] (**required**).
        * ``solar_radiation_W_m2`` -- horizontal solar irradiance
          [W/m^2] (optional; irradiance metrics are ``NaN`` without it).
        * ``indoor_temperature_C`` -- shelter interior temperature [C]
          (optional; the correlation metric is ``NaN`` without it).
    configuration : dict
        Nested configuration dict. The solar aperture is read from
        ``configuration["windows"]["area_m2"]`` (with a fallback to
        ``configuration["solar"]["area_m2"]``). The SHGC is read from
        ``configuration["windows"]["SHGC"]`` with a fallback to
        ``["windows"]["eta_solar"]`` then ``["solar"]["eta_solar"]``.

    Returns
    -------
    dict
        Dictionary with exactly these seven float keys:

        ``total_energy_Wh``
            Total solar energy over the whole period [Wh]
            (sum of ``Q_solar_W``, one row == one hour).
        ``total_energy_MJ``
            Same total expressed in MJ (``total_energy_Wh * 0.0036``).
        ``peak_irradiance_W_m2``
            Maximum hourly ``solar_radiation_W_m2``.
        ``peak_gain_W``
            Maximum instantaneous ``Q_solar_W``.
        ``avg_irradiance_W_m2``
            Mean ``solar_radiation_W_m2`` across all hours.
        ``capacity_factor_percent``
            ``(mean Q_solar_W) / (area_m2 * peak_irradiance) * 100`` --
            how hard the aperture works relative to a clear-sky peak.
        ``solar_temp_correlation``
            Pearson correlation between hourly irradiance and the hourly
            indoor-temperature change ``dT_in(t) = T_in(t) - T_in(t-1)``.
            ``NaN`` when either series has no variance or fewer than two
            usable points.

    Raises
    ------
    TypeError
        If ``results_df`` is not a pandas DataFrame.
    KeyError
        If the ``Q_solar_W`` column is missing.

    Notes
    -----
    * An empty DataFrame returns the seven keys with all values ``NaN``.
    * Missing optional columns or configuration keys degrade one metric
      to ``NaN`` rather than raising.
    * ``capacity_factor_percent`` is ``0.0`` when all irradiance is zero
      and ``NaN`` when the aperture area is unknown.

    Examples
    --------
    >>> df = pd.DataFrame({
    ...     "Q_solar_W": [0, 200, 400, 200, 0],
    ...     "solar_radiation_W_m2": [0, 300, 600, 300, 0],
    ...     "indoor_temperature_C": [10.0, 10.4, 11.1, 11.3, 11.0],
    ... })
    >>> m = calculate_solar_metrics(df, {"windows": {"area_m2": 2.5}})
    >>> sorted(m)
    ['avg_irradiance_W_m2', 'capacity_factor_percent', 'peak_gain_W', ...]
    """

    keys = (
        "total_energy_Wh",
        "total_energy_MJ",
        "peak_irradiance_W_m2",
        "peak_gain_W",
        "avg_irradiance_W_m2",
        "capacity_factor_percent",
        "solar_temp_correlation",
    )

    metrics = {key: float("nan") for key in keys}

    if not isinstance(results_df, pd.DataFrame):

        raise TypeError(
            "results_df must be a pandas DataFrame, got "
            f"{type(results_df).__name__}"
        )

    if "Q_solar_W" not in results_df.columns:

        raise KeyError(
            "results_df is missing the required 'Q_solar_W' column. "
            "calculate_solar_metrics needs at least the hourly solar "
            f"gain. Columns present: {list(results_df.columns)}"
        )

    # Empty input -> all-NaN dict (documented contract).
    if len(results_df) == 0:
        return metrics

    n_hours = len(results_df)

    q_solar = _clean_series(results_df["Q_solar_W"])

    # --- Metrics 1 & 7: total energy (Wh == W summed over 1-h rows) ----
    total_wh = float(q_solar.sum())
    metrics["total_energy_Wh"] = total_wh
    metrics["total_energy_MJ"] = total_wh * WH_PER_MJ

    # --- Metric 3: peak instantaneous solar gain ----------------------
    metrics["peak_gain_W"] = float(q_solar.max())

    # --- Metrics 2 & 4: irradiance stats (need the irradiance column) -
    irradiance = None

    if "solar_radiation_W_m2" in results_df.columns:

        irradiance = pd.to_numeric(
            results_df["solar_radiation_W_m2"],
            errors="coerce",
        )

        if irradiance.notna().any():
            metrics["peak_irradiance_W_m2"] = float(irradiance.max())
            metrics["avg_irradiance_W_m2"] = float(irradiance.mean())

    # --- Metric 5: capacity factor ----------------------------------
    area_m2, _shgc = _resolve_aperture(configuration)

    peak_irr = metrics["peak_irradiance_W_m2"]

    if not np.isnan(area_m2) and not np.isnan(peak_irr):

        theoretical_max_w = area_m2 * peak_irr

        if theoretical_max_w > 0:
            avg_q_solar = total_wh / n_hours
            metrics["capacity_factor_percent"] = float(
                avg_q_solar / theoretical_max_w * 100.0
            )
        else:
            # No sun at all over the period -> aperture did no work.
            metrics["capacity_factor_percent"] = 0.0

    # --- Metric 6: solar / indoor-temperature-change correlation -----
    if (
        irradiance is not None
        and "indoor_temperature_C" in results_df.columns
    ):

        t_in = pd.to_numeric(
            results_df["indoor_temperature_C"],
            errors="coerce",
        )

        # Hourly change in indoor temperature; first row becomes NaN.
        delta_t_in = t_in.diff()

        pair = pd.DataFrame(
            {
                "irradiance": irradiance.to_numpy(),
                "delta_t": delta_t_in.to_numpy(),
            }
        ).dropna()

        # Need >= 2 points and non-zero variance in both columns,
        # otherwise Pearson's r is undefined.
        if (
            len(pair) >= 2
            and pair["irradiance"].std(ddof=0) > 0
            and pair["delta_t"].std(ddof=0) > 0
        ):
            try:
                r_value, _p_value = pearsonr(
                    pair["irradiance"],
                    pair["delta_t"],
                )
                metrics["solar_temp_correlation"] = float(r_value)

            except ValueError:
                # Any residual degenerate case -> leave as NaN.
                metrics["solar_temp_correlation"] = float("nan")

    return metrics


# ==================================================
# FUNCTION 3 - THREE-PANEL FIGURE
# ==================================================

def plot_solar_analysis(
    results_df: pd.DataFrame,
    daily_energy_series: pd.Series,
    output_file: str,
) -> None:
    """Render a three-panel solar-energy figure and save it as PNG.

    The panels, top to bottom:

    1. **Hourly Solar Thermal Gain** -- filled area of ``Q_solar_W``
       against time; shows the diurnal pulse of solar gain.
    2. **Daily Total Solar Energy** -- bar chart of
       ``daily_energy_series``; bar colour scales with the day's total
       so good and poor solar days are obvious at a glance.
    3. **Cumulative Solar Energy Over Period** -- running sum of
       ``Q_solar_W`` [Wh]; the slope is the current solar power and the
       end value is the period total.

    Parameters
    ----------
    results_df : pandas.DataFrame
        Hourly results table. Must contain ``timestamp`` and
        ``Q_solar_W``.
    daily_energy_series : pandas.Series
        Output of :func:`calculate_daily_solar_energy` -- index is dates,
        values are daily energy totals. The Series name is used to label
        the middle panel's y-axis (so ``Wh`` vs ``MJ`` is picked up
        automatically); an empty Series just yields an empty panel.
    output_file : str
        Path to write the PNG to, e.g. ``"results/solar_analysis.png"``.
        Parent directories are created if missing.

    Returns
    -------
    None

    Raises
    ------
    TypeError
        If ``results_df`` is not a DataFrame or ``daily_energy_series``
        is not a Series.
    KeyError
        If ``timestamp`` or ``Q_solar_W`` is missing from ``results_df``.
    OSError
        If ``output_file`` cannot be written (bad path, permissions,
        un-creatable directory). The message includes the offending path.

    Notes
    -----
    * The figure is 14 x 10 inches at 300 DPI.
    * The matplotlib figure is always closed before returning, including
      on the error paths, so this is safe to call in a loop.
    * An empty ``results_df`` still produces a valid (empty) figure
      rather than raising.

    Examples
    --------
    >>> daily = calculate_daily_solar_energy(results_df, unit="Wh")
    >>> plot_solar_analysis(results_df, daily, "results/solar_analysis.png")
    """

    # --- input validation -----------------------------------------
    if not isinstance(results_df, pd.DataFrame):

        raise TypeError(
            "results_df must be a pandas DataFrame, got "
            f"{type(results_df).__name__}"
        )

    if not isinstance(daily_energy_series, pd.Series):

        raise TypeError(
            "daily_energy_series must be a pandas Series (the output of "
            "calculate_daily_solar_energy), got "
            f"{type(daily_energy_series).__name__}"
        )

    for required in ("timestamp", "Q_solar_W"):

        if required not in results_df.columns:

            raise KeyError(
                f"results_df is missing the required '{required}' column. "
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

    # --- prepare the data ----------------------------------------
    df = _ensure_datetime(results_df, "timestamp")
    df["Q_solar_W"] = _clean_series(df["Q_solar_W"])

    y_unit = "Wh"
    if daily_energy_series.name and "_MJ" in str(daily_energy_series.name):
        y_unit = "MJ"

    title_kw = {"fontsize": 12, "fontweight": "bold"}
    label_kw = {"fontsize": 11, "fontweight": "bold"}

    fig, (ax_hourly, ax_daily, ax_cumulative) = plt.subplots(
        nrows=3,
        ncols=1,
        figsize=(14, 10),
    )

    try:
        # =======================================================
        # PANEL 1 - hourly solar thermal gain (area chart)
        # =======================================================
        ax_hourly.fill_between(
            df["timestamp"],
            df["Q_solar_W"],
            color="gold",
            alpha=0.7,
            label="Q_solar",
        )
        ax_hourly.plot(
            df["timestamp"],
            df["Q_solar_W"],
            color="darkorange",
            linewidth=1.0,
        )
        ax_hourly.set_title("Hourly Solar Thermal Gain", **title_kw)
        ax_hourly.set_xlabel("Time", **label_kw)
        ax_hourly.set_ylabel("Solar gain Q_solar [W]", **label_kw)
        ax_hourly.grid(True, alpha=0.3)
        ax_hourly.legend(loc="upper right")

        if len(df) > 0:
            ax_hourly.xaxis.set_major_formatter(
                DateFormatter("%m-%d %H:%M")
            )
            ax_hourly.xaxis.set_major_locator(
                mdates.AutoDateLocator()
            )

        # =======================================================
        # PANEL 2 - daily total solar energy (colour-graded bars)
        # =======================================================
        if len(daily_energy_series) > 0:

            dates = list(daily_energy_series.index)
            values = daily_energy_series.to_numpy(dtype=float)

            # Colour each bar light -> dark by how much energy that day
            # collected, so weak solar days read as pale bars.
            vmin = float(np.nanmin(values))
            vmax = float(np.nanmax(values))
            norm = Normalize(
                vmin=vmin,
                vmax=vmax if vmax > vmin else vmin + 1.0,
            )
            cmap = plt.get_cmap("YlOrRd")
            bar_colors = [cmap(0.25 + 0.7 * norm(v)) for v in values]

            ax_daily.bar(
                [str(d) for d in dates],
                values,
                color=bar_colors,
                edgecolor="darkred",
                linewidth=0.5,
            )

        ax_daily.set_title("Daily Total Solar Energy", **title_kw)
        ax_daily.set_xlabel("Date", **label_kw)
        ax_daily.set_ylabel(f"Daily solar energy [{y_unit}]", **label_kw)
        ax_daily.grid(True, alpha=0.3, axis="y")

        for tick in ax_daily.get_xticklabels():
            tick.set_rotation(45)
            tick.set_horizontalalignment("right")

        # =======================================================
        # PANEL 3 - cumulative solar energy over the period
        # =======================================================
        # 1 row == 1 hour, so the running sum of W is Wh.
        cumulative_wh = df["Q_solar_W"].cumsum()

        ax_cumulative.fill_between(
            df["timestamp"],
            cumulative_wh,
            color="gold",
            alpha=0.3,
        )
        ax_cumulative.plot(
            df["timestamp"],
            cumulative_wh,
            color="orange",
            linewidth=2.0,
            label="Cumulative",
        )
        ax_cumulative.set_title(
            "Cumulative Solar Energy Over Period", **title_kw
        )
        ax_cumulative.set_xlabel("Time", **label_kw)
        ax_cumulative.set_ylabel("Cumulative solar energy [Wh]", **label_kw)
        ax_cumulative.grid(True, alpha=0.3)
        ax_cumulative.legend(loc="upper left")

        if len(df) > 0:
            ax_cumulative.xaxis.set_major_formatter(
                DateFormatter("%m-%d %H:%M")
            )
            ax_cumulative.xaxis.set_major_locator(
                mdates.AutoDateLocator()
            )

        # Rotate the datetime tick labels on the two time-axis panels.
        for ax in (ax_hourly, ax_cumulative):
            for tick in ax.get_xticklabels():
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
# SELF-TEST / DEMO
# ==================================================

def _self_test() -> None:
    """Exercise the three functions on synthetic data.

    Run with ``python solar_analysis.py``.
    """

    # --- Function 1: 24 h of constant 100 W -> 2400 Wh ---------------
    df_const = pd.DataFrame(
        {
            "timestamp": pd.date_range(
                "2024-01-05", periods=24, freq="h"
            ),
            "Q_solar_W": [100.0] * 24,
        }
    )
    daily = calculate_daily_solar_energy(df_const, unit="Wh")
    assert len(daily) == 1
    assert abs(daily.iloc[0] - 2400.0) < 1e-6, daily.iloc[0]

    # --- Function 1: 1 h at 0 W, 23 h at 100 W -> 2300 Wh -----------
    df_gap = df_const.copy()
    df_gap.loc[0, "Q_solar_W"] = 0.0
    daily_gap = calculate_daily_solar_energy(df_gap, unit="Wh")
    assert abs(daily_gap.iloc[0] - 2300.0) < 1e-6, daily_gap.iloc[0]

    # MJ conversion
    daily_mj = calculate_daily_solar_energy(df_const, unit="MJ")
    assert abs(daily_mj.iloc[0] - 2400.0 * 0.0036) < 1e-9

    # --- Function 2: 48 h of varying irradiance --------------------
    rng = np.random.default_rng(0)
    hours = pd.date_range("2024-01-05", periods=48, freq="h")
    irr = np.clip(
        800.0 * np.sin(np.linspace(0, 4 * np.pi, 48)) ** 2
        + rng.normal(0, 20, 48),
        0,
        None,
    )
    area, shgc = 2.5, 0.70
    q_solar = area * shgc * irr
    t_in = 10.0 + np.cumsum((q_solar - q_solar.mean()) / 5000.0)

    df_var = pd.DataFrame(
        {
            "timestamp": hours,
            "Q_solar_W": q_solar,
            "solar_radiation_W_m2": irr,
            "indoor_temperature_C": t_in,
        }
    )
    config = {"windows": {"area_m2": area, "SHGC": shgc}}

    metrics = calculate_solar_metrics(df_var, config)
    assert set(metrics) == {
        "total_energy_Wh",
        "total_energy_MJ",
        "peak_irradiance_W_m2",
        "peak_gain_W",
        "avg_irradiance_W_m2",
        "capacity_factor_percent",
        "solar_temp_correlation",
    }
    for key, value in metrics.items():
        assert isinstance(value, float), (key, type(value))

    # Empty-input contract
    empty = calculate_solar_metrics(
        pd.DataFrame({"Q_solar_W": []}), config
    )
    assert all(np.isnan(v) for v in empty.values())

    # --- Function 3: render the 3-panel figure --------------------
    out_path = os.path.join("results", "solar_analysis_selftest.png")
    daily_var = calculate_daily_solar_energy(df_var, unit="Wh")
    plot_solar_analysis(df_var, daily_var, out_path)
    assert os.path.isfile(out_path)

    print("solar_analysis self-test: all checks passed")
    print(f"  daily energy (const 100 W)     : {daily.iloc[0]:.1f} Wh")
    print(f"  daily energy (1 h gap)         : {daily_gap.iloc[0]:.1f} Wh")
    print(f"  total energy (48 h synthetic)  : "
          f"{metrics['total_energy_Wh']:.0f} Wh "
          f"({metrics['total_energy_MJ']:.2f} MJ)")
    print(f"  peak irradiance                : "
          f"{metrics['peak_irradiance_W_m2']:.1f} W/m^2")
    print(f"  capacity factor                : "
          f"{metrics['capacity_factor_percent']:.1f} %")
    print(f"  solar / dT_in correlation      : "
          f"{metrics['solar_temp_correlation']:.3f}")
    print(f"  figure written to              : {out_path}")


if __name__ == "__main__":
    _self_test()
