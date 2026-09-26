"""M6 phase 10: M6 touches other modules only through their public interfaces."""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

import design_generator

PKG = Path(__file__).resolve().parents[1]
SOURCES = sorted(p for p in PKG.glob("*.py"))                          # M6 itself, not its tests
TESTS = sorted((PKG / "tests").glob("*.py"))
STDLIB = set(sys.stdlib_module_names) | {"__future__"}
ALLOWED_ROOTS = STDLIB | {"cocoon_contracts", "design_generator", "optimization", "pydantic", "numpy", "pytest"}


def imports(path: Path):
    """(module, names, line, inside_function) for every import in a file."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = []

    def visit(node, in_function):
        for child in ast.iter_child_nodes(node):
            inner = in_function or isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
            if isinstance(child, ast.ImportFrom) and child.level == 0:
                found.append((child.module or "", [a.name for a in child.names], child.lineno, in_function))
            elif isinstance(child, ast.Import):
                found.extend((a.name, [], child.lineno, in_function) for a in child.names)
            visit(child, inner)
    visit(tree, False)
    return found


@pytest.mark.parametrize("path", SOURCES + TESTS, ids=lambda p: p.name)
def test_only_known_packages_are_imported(path):
    for module, names, line, _ in imports(path):
        assert module.split(".")[0] in ALLOWED_ROOTS, f"{path.name}:{line} imports {module}"


@pytest.mark.parametrize("path", SOURCES + TESTS, ids=lambda p: p.name)
def test_m2_is_used_only_through_its_public_names(path):
    public = set(design_generator.__all__)
    for module, names, line, _ in imports(path):
        if module.split(".")[0] != "design_generator":
            continue
        assert module == "design_generator", f"{path.name}:{line} reaches into {module}"
        assert set(names) <= public, f"{path.name}:{line} uses non-public {sorted(set(names) - public)}"


@pytest.mark.parametrize("path", SOURCES + TESTS, ids=lambda p: p.name)
def test_no_private_name_is_imported_from_any_other_module(path):
    for module, names, line, _ in imports(path):
        assert not any(p.startswith("_") and not p.startswith("__") for p in module.split(".")), \
            f"{path.name}:{line} imports from private module {module}"
        private = [n for n in names if n.startswith("_") and not n.startswith("__")]
        assert not private, f"{path.name}:{line} imports private {private} from {module}"


@pytest.mark.parametrize("path", SOURCES + TESTS, ids=lambda p: p.name)
def test_the_contracts_are_imported_from_their_public_modules(path):
    for module, names, line, _ in imports(path):
        if module.split(".")[0] == "cocoon_contracts":
            assert module.count(".") <= 1, f"{path.name}:{line} imports {module}"


def test_test_doubles_are_only_reachable_from_the_command_line_and_the_tests():
    for path in SOURCES:
        for module, _, line, in_function in imports(path):
            if module.startswith("optimization.tests"):
                assert path.name == "__main__.py" and in_function, f"{path.name}:{line} imports the test doubles ({module})"


def test_the_public_package_imports_cleanly_without_the_test_doubles():
    import subprocess

    code = ("import sys, optimization; assert not any(m.startswith('optimization.tests') for m in sys.modules), "
            "[m for m in sys.modules if m.startswith('optimization.tests')]; print('ok')")
    out = subprocess.run([sys.executable, "-B", "-c", code], capture_output=True, text=True, cwd=PKG.parent, timeout=60)
    assert out.returncode == 0 and out.stdout.strip() == "ok", out.stderr


def test_the_checker_itself_sees_a_bad_import(tmp_path):
    bad = tmp_path / "bad.py"
    bad.write_text("from __future__ import annotations\nfrom design_generator.constraints import x\n"
                   "from optimization.objectives import _thing\nimport thermal_model\n", encoding="utf-8")
    found = imports(bad)
    assert [m for m, *_ in found] == ["__future__", "design_generator.constraints", "optimization.objectives", "thermal_model"]
    assert found[2][1] == ["_thing"] and found[0][0].startswith("__")                     # dunders are not private, _thing is
