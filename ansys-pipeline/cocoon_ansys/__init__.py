"""
cocoon_ansys - Module M8: multi-zone / multi-storey ANSYS MAPDL validation.

Takes an immutable M0 BuildingModel revision plus a frozen weather and
material snapshot, builds a conforming hexahedral SOLID70 model of every
room, envelope stack, partition and inter-storey slab, solves the
transient heat conduction in MAPDL, and compares each room's air
temperature against the multi-zone RC engine run on the SAME scenario.

Independence rule (PRD v4 §0.3 rule 4, §14.1): ANSYS receives geometry,
materials, films and the weather/ground/solar/internal-gain inputs only.
It never receives an RC-predicted temperature.

Layout (PRD v4 §6 names):
    paths.py                      repo/contract/ANSYS locations
    contracts_io.py               load + validate M0 contracts, hashing
    weather_snapshot.py           WeatherSnapshot from the Leh archive
    geometry_builder.py           BuildingModel -> conforming hex grid
    boundary_condition_builder.py hourly BC series (T_out, ground, solar, gains)
    validation_package.py         frozen, hashed job package
    pyansys_runner.py             MAPDL mesh push, solve, extraction
    contour_export.py             geometry / mesh / contour images
    comparison.py                 same scenario through multiroom_rc + metrics
    worker.py                     job state machine (PRD §14.9) + CLI
"""

__version__ = "1.0.0"
