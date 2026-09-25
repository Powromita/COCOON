"""
environment -- Person 2 (M3 + parts of M4): weather, materials and
environmental physics for the COCOON RC thermal engine.

Pure, vectorised functions in SI units. Nothing here depends on the RC
solver; the solver (or engine_adapter) calls in.

Modules
-------
constants   physical constants (the only place they are defined)
adapters    contract-dict -> function-argument mapping, physics_level switch
weather     weather data, fetch, cache                      (Phase 2)
materials   material DB, layered constructions             (Phase 1)
solar       sun position, POA irradiance, window gain      (Phases 3-4)
convection  exterior convection                            (Phase 5)
sky         sky temperature, longwave exchange             (Phase 6)
airflow     air density, infiltration, doors, stairs       (Phases 7, 9)
ground      ground temperature, floor-ground conductance   (Phase 8)
boundary    precomputed boundary conditions for the solver (Phase 10)
"""

__version__ = "0.0.1"
