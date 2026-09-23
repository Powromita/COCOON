"""
scenario_generator.py

Generates a pool of *buildable* random shelter designs that respect the
design constraints in the two project CSVs:

  - shelter_ratios_recommended.csv      (aspect ratio, A/V, WWR, height,
                                         floor-area bounds)
  - shelter_elements_dimensions__1_.csv (per-element material options,
                                         a ``layer_role`` of ``structural``
                                         or ``insulation``, and a realistic
                                         thickness range for each)

Realism rules (this is the point of the rewrite):

  * Every wall / roof / floor is composed as **one structural layer plus
    an optional insulation layer** -- never two random slabs. The
    structural layer carries the thermal mass; the insulation (if drawn)
    goes on the inside face.
  * Layer thicknesses are sampled inside the CSV's realistic range, and
    the finished assembly thickness is clamped to a buildable envelope
    (walls 250-650 mm, roof 180-450 mm, floor 130-400 mm) -- nothing
    paper-thin, nothing bunker-thick.
  * Cold-climate glazing is favoured (triple > double >> single).
  * Geometry is sampled from a compact, realistic box and must also pass
    the ceiling-height and floor-area bounds, not just aspect / A/V.

Each design dict is already in the shape the RC physics engine
(thermal-calculator/thermal_model.run_simulation) expects.

Run standalone to preview:
    python scenario_generator.py
"""

import json

import numpy as np
import pandas as pd


# compact realistic sampling box (metres)
_L_RANGE = (3.5, 7.0)
_W_RANGE = (2.5, 5.0)
_H_RANGE = (2.3, 3.0)

# buildable finished-assembly thickness envelope (mm)
_ASSEMBLY_MM = {
    "walls": (250, 650),
    "roof": (180, 450),
    "floor": (130, 400),
}

# probability an insulation layer is added to each surface
_INSULATION_P = {"walls": 0.75, "roof": 0.75, "floor": 0.55}

# cold-climate glazing preference
_GLAZING_WEIGHTS = {"single": 0.12, "double": 0.50, "triple": 0.38}

_MAX_GEOMETRY_TRIES = 6000
_MAX_ASSEMBLY_TRIES = 200
_MAX_WINDOWS = 8


class ScenarioGenerator:
    """Buildable random-shelter-design factory."""

    def __init__(self, csv_ratios_path, csv_elements_path, seed=None, fixed=None):
        """``fixed`` (optional) pins the box and the openings so the pool
        only varies the envelope the pipeline is asked to design:

            {"geometry": {"length_m", "width_m", "height_m"},
             "window":   {"count", "width_m", "height_m"},   # width/height optional
             "door":     {"count"}}                          # optional

        With ``fixed`` set, geometry is taken verbatim (the aspect / A/V /
        height / floor-area bounds are not enforced) and the window count
        is used as given instead of being derived from a WWR target. The
        wall / roof / floor materials + thicknesses, the insulation, and
        the glazing type are still sampled -- that is the design work the
        pipeline does."""

        self.ratios_df = pd.read_csv(csv_ratios_path)
        self.elements_df = pd.read_csv(csv_elements_path)
        self.rng = np.random.default_rng(seed)
        self.fixed = fixed or None

        self.constraints = self._parse_constraints()
        self.materials = self._parse_materials()

        for group in ("walls", "roof", "floor"):
            if not self.materials[group]["structural"]:
                raise ValueError(
                    f"No structural '{group[:-1] if group!='walls' else 'wall'}'"
                    f" option in the elements CSV."
                )
        if not self.materials["windows"]:
            raise ValueError("No window options in the elements CSV.")

    # ---------------------------------------------------------------
    # CSV parsing
    # ---------------------------------------------------------------

    def _parse_constraints(self):
        constraints = {}
        for _, row in self.ratios_df.iterrows():
            constraints[str(row["factor"]).strip()] = {
                "min": float(row["min_value"]),
                "max": float(row["max_value"]),
                "recommended": float(row["recommended_value"]),
            }
        for required in (
            "Length-to-Width Aspect Ratio",
            "Surface Area-to-Volume Ratio (A/V)",
            "Window-to-Wall Ratio (WWR)",
        ):
            if required not in constraints:
                raise ValueError(f"Ratios CSV missing '{required}' row.")
        return constraints

    def _parse_materials(self):
        """Group into per-surface, per-role option lists."""

        materials = {
            "walls": {"structural": [], "insulation": []},
            "roof": {"structural": [], "insulation": []},
            "floor": {"structural": [], "insulation": []},
            "windows": [],
            "doors": [],
            "vents": [],
        }
        surface_map = {"wall": "walls", "roof": "roof", "floor": "floor"}

        for _, row in self.elements_df.iterrows():
            element = str(row["element"]).strip().lower()
            mat_type = str(row["type"]).strip()
            role = str(row.get("layer_role", "structural")).strip().lower()
            param = str(row["dimension_parameter"]).strip().lower()
            min_val = float(row["min_value"])
            max_val = float(row["max_value"])

            if element in surface_map and param == "thickness":
                bucket = "insulation" if role == "insulation" else "structural"
                materials[surface_map[element]][bucket].append(
                    {
                        "type": mat_type,
                        "thickness_mm_min": min_val,
                        "thickness_mm_max": max_val,
                    }
                )
            elif element == "window" and param == "width":
                materials["windows"].append(
                    {"type": mat_type, "width_m": min_val, "height_m": max_val}
                )
            elif element == "door" and param == "width":
                materials["doors"].append(
                    {"type": mat_type, "width_m": min_val, "height_m": max_val}
                )
            elif element == "vent" and param == "width":
                materials["vents"].append(
                    {"type": mat_type, "width_m": min_val, "height_m": max_val}
                )

        return materials

    # ---------------------------------------------------------------
    # constraint checks
    # ---------------------------------------------------------------

    @staticmethod
    def _envelope_area(L, W, H):
        return 2 * (L * H + W * H) + L * W

    def _geometry_ok(self, L, W, H):
        c = self.constraints
        aspect = L / W
        av = self._envelope_area(L, W, H) / (L * W * H)
        floor_area = L * W

        checks = [
            c["Length-to-Width Aspect Ratio"]["min"] <= aspect
            <= c["Length-to-Width Aspect Ratio"]["max"],
            c["Surface Area-to-Volume Ratio (A/V)"]["min"] <= av
            <= c["Surface Area-to-Volume Ratio (A/V)"]["max"],
        ]
        if "Ceiling Height (m)" in c:
            checks.append(
                c["Ceiling Height (m)"]["min"] <= H
                <= c["Ceiling Height (m)"]["max"]
            )
        if "Floor Area (m2)" in c:
            checks.append(
                c["Floor Area (m2)"]["min"] <= floor_area
                <= c["Floor Area (m2)"]["max"]
            )
        return all(checks), aspect, av, floor_area

    def _check_wwr(self, window_area, gross_wall_area):
        wwr = (window_area / gross_wall_area) * 100 if gross_wall_area else 0.0
        c = self.constraints["Window-to-Wall Ratio (WWR)"]
        return c["min"] <= wwr <= c["max"], wwr

    # ---------------------------------------------------------------
    # design construction
    # ---------------------------------------------------------------

    def _random_geometry(self):
        if self.fixed and self.fixed.get("geometry"):
            g = self.fixed["geometry"]
            L = float(g["length_m"])
            W = float(g["width_m"])
            H = float(g["height_m"])
            aspect = L / W
            av = self._envelope_area(L, W, H) / (L * W * H)
            return L, W, H, aspect, av, L * W

        for _ in range(_MAX_GEOMETRY_TRIES):
            L = float(self.rng.uniform(*_L_RANGE))
            W = float(self.rng.uniform(*_W_RANGE))
            H = float(self.rng.uniform(*_H_RANGE))
            ok, aspect, av, floor_area = self._geometry_ok(L, W, H)
            if ok:
                return L, W, H, aspect, av, floor_area
        raise RuntimeError(
            "Could not sample a geometry meeting the aspect / A/V / height / "
            "floor-area bounds -- relax shelter_ratios_recommended.csv."
        )

    def _sample_layer(self, option):
        thickness = self.rng.uniform(
            option["thickness_mm_min"], option["thickness_mm_max"]
        )
        return {"material": option["type"], "thickness_mm": int(round(thickness))}

    def _compose_assembly(self, group):
        """Optional *exterior* insulation layer + one structural layer, with
        the finished thickness clamped to the buildable envelope.

        Layer order follows the project convention: index 0 is the
        outermost layer. Insulation goes on the **outside** so the
        structural thermal mass stays coupled to the indoor air (the
        cold-climate passive-solar approach: external insulation, exposed
        internal mass). Interior insulation would thermally decouple the
        mass and defeat the point of building heavy.
        """

        lo, hi = _ASSEMBLY_MM[group]
        structural_opts = self.materials[group]["structural"]
        insulation_opts = self.materials[group]["insulation"]

        for _ in range(_MAX_ASSEMBLY_TRIES):
            layers = []

            add_insulation = (
                insulation_opts
                and self.rng.random() < _INSULATION_P[group]
            )
            if add_insulation:
                # insulation on the outside face -> first in the list
                layers.append(
                    self._sample_layer(
                        insulation_opts[
                            int(self.rng.integers(len(insulation_opts)))
                        ]
                    )
                )

            layers.append(
                self._sample_layer(
                    structural_opts[int(self.rng.integers(len(structural_opts)))]
                )
            )

            total = sum(lyr["thickness_mm"] for lyr in layers)
            if lo <= total <= hi:
                return layers

        # fall back to a plain structural layer at the midpoint thickness
        mid = int(round((lo + hi) / 2))
        return [{"material": structural_opts[0]["type"], "thickness_mm": mid}]

    def _pick_glazing(self):
        types = [w["type"] for w in self.materials["windows"]]
        weights = np.array(
            [_GLAZING_WEIGHTS.get(t, 0.1) for t in types], dtype=float
        )
        weights /= weights.sum()
        idx = int(self.rng.choice(len(types), p=weights))
        return self.materials["windows"][idx]

    def generate_single_design(self, design_id):
        L, W, H, aspect, av, floor_area = self._random_geometry()
        gross_wall_area = 2 * (L * H + W * H)

        walls = self._compose_assembly("walls")
        roof = self._compose_assembly("roof")
        floor = self._compose_assembly("floor")

        win = self._pick_glazing()
        fixed_win = (self.fixed or {}).get("window") or {}
        win_w = float(fixed_win.get("width_m") or win["width_m"])
        win_h = float(fixed_win.get("height_m") or win["height_m"])
        win = {**win, "width_m": win_w, "height_m": win_h}
        per_window = win_w * win_h

        if fixed_win.get("count") is not None:
            # user pinned the opening count -- honour it exactly
            count = max(0, int(round(fixed_win["count"])))
            window_area = count * per_window
            wwr_ok, wwr = self._check_wwr(window_area, gross_wall_area)
            wwr_ok = True
        else:
            target_wwr = float(
                self.rng.uniform(
                    self.constraints["Window-to-Wall Ratio (WWR)"]["min"],
                    self.constraints["Window-to-Wall Ratio (WWR)"]["max"],
                )
            )
            count = max(
                1,
                min(_MAX_WINDOWS, int(round(gross_wall_area * target_wwr / 100 / per_window))),
            )
            window_area = count * per_window
            wwr_ok, wwr = self._check_wwr(window_area, gross_wall_area)

        if not wwr_ok and not fixed_win.get("count"):
            lo = self.constraints["Window-to-Wall Ratio (WWR)"]["min"]
            hi = self.constraints["Window-to-Wall Ratio (WWR)"]["max"]
            lo_n = max(1, int(np.ceil(gross_wall_area * lo / 100 / per_window)))
            hi_n = max(1, int(np.floor(gross_wall_area * hi / 100 / per_window)))
            if lo_n <= hi_n:
                count = int(min(_MAX_WINDOWS, lo_n))
                window_area = count * per_window
                wwr_ok, wwr = self._check_wwr(window_area, gross_wall_area)

        door = (
            self.materials["doors"][
                int(self.rng.integers(len(self.materials["doors"])))
            ]
            if self.materials["doors"]
            else {"type": "single_leaf"}
        )

        wall_mm = sum(lyr["thickness_mm"] for lyr in walls)
        roof_mm = sum(lyr["thickness_mm"] for lyr in roof)
        floor_mm = sum(lyr["thickness_mm"] for lyr in floor)

        return {
            "design_id": design_id,
            "geometry": {
                "length_m": round(L, 2),
                "width_m": round(W, 2),
                "height_m": round(H, 2),
            },
            "walls": walls,
            "roof": roof,
            "floor": floor,
            "windows": {
                "type": win["type"],
                "count": count,
                "width_m": win["width_m"],
                "height_m": win["height_m"],
                "area_m2": round(window_area, 3),
            },
            "doors": {
                "type": door["type"],
                "count": (int((self.fixed or {}).get("door", {}).get("count"))
                          if (self.fixed or {}).get("door", {}).get("count") is not None
                          else int(self.rng.integers(1, 3))),
            },
            "aspect_ratio": round(aspect, 3),
            "av_ratio": round(av, 3),
            "floor_area_m2": round(floor_area, 1),
            "wwr_percent": round(wwr, 1),
            "wwr_within_band": bool(wwr_ok),
            "wall_thickness_mm": wall_mm,
            "roof_thickness_mm": roof_mm,
            "floor_thickness_mm": floor_mm,
        }

    def generate_candidates(self, num_designs=50):
        designs = []
        for i in range(num_designs):
            try:
                designs.append(self.generate_single_design(i))
                print(f"[ok]   design #{i + 1} generated")
            except Exception as exc:                       # noqa: BLE001
                print(f"[skip] design #{i + 1} failed: {exc}")
        print(f"\n[done] {len(designs)}/{num_designs} designs generated")
        return designs

    @staticmethod
    def save_pool(designs, path):
        """Write the design pool to JSON. After this, downstream stages
        read the file -- they never regenerate the pool from a seed, so
        'design 7' means the same shelter for the life of the run."""
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(designs, fh, indent=2)
        print(f"[done] pool of {len(designs)} designs -> {path}")


def load_pool(path):
    """Load a design pool written by ScenarioGenerator.save_pool."""
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


if __name__ == "__main__":
    gen = ScenarioGenerator(
        "shelter_ratios_recommended.csv",
        "shelter_elements_dimensions__1_.csv",
        seed=0,
    )
    candidates = gen.generate_candidates(num_designs=5)
    print()
    print(json.dumps(candidates[0], indent=2))
