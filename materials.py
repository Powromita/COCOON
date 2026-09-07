"""
Material database helpers for the
DRDO Shelter Thermal Calculator.
"""

import json


REQUIRED_NUMERIC_FIELDS = (

    "thermal_conductivity",

    "density",

    "specific_heat"

)


def _validate_material(

    material_id,

    material

):

    if not isinstance(

        material,

        dict

    ):

        raise ValueError(

            f"Material '{material_id}' must be a JSON object."

        )


    for field in REQUIRED_NUMERIC_FIELDS:


        if field not in material:

            raise ValueError(

                f"Material '{material_id}' is missing "
                f"required field '{field}'."

            )


        try:

            value = float(

                material[field]

            )


        except (

            TypeError,

            ValueError

        ):

            raise ValueError(

                f"Material '{material_id}' field "
                f"'{field}' must be numeric."

            )


        if value <= 0:

            raise ValueError(

                f"Material '{material_id}' field "
                f"'{field}' must be greater than zero."

            )


    material.setdefault(

        "display_name",

        material_id.replace(

            "_",

            " "

        ).title()

    )


    material.setdefault(

        "category",

        "uncategorized"

    )


    material.setdefault(

        "data_status",

        "not_specified"

    )


    material.setdefault(

        "data_source",

        "not_specified"

    )



def load_materials(

    filepath

):

    with open(

        filepath,

        "r",

        encoding="utf-8"

    ) as file:

        materials = json.load(

            file

        )


    if not isinstance(

        materials,

        dict

    ) or not materials:

        raise ValueError(

            "Material database must contain "
            "at least one material."

        )


    for material_id, material in materials.items():

        _validate_material(

            material_id,

            material

        )


    return materials



def get_material(

    materials,

    material_name

):

    material_id = (

        material_name

        .lower()

        .strip()

    )


    if material_id not in materials:

        available = (

            ", ".join(

                materials.keys()

            )

        )


        raise ValueError(

            f"Material '{material_name}' not found. "

            f"Available materials: {available}"

        )


    return materials[

        material_id

    ]



def get_material_display_name(

    material_id,

    material

):

    return material.get(

        "display_name",

        material_id.replace(

            "_",

            " "

        ).title()

    )