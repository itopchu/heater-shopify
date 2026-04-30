"""Parametric 3D model generator for G-Berg radiator catalog.

Reads a product JSON from `product-catalog/products/<handle>.json`, picks one
variant size (W x H in cm), and builds an approximate Blender mesh: two
vertical side rails plus evenly spaced horizontal cross-tubes for the towel-
warmer family of products. Outputs `.blend` and `.glb` next to each other.

Run via Blender (no Python deps required besides bpy):

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" \
        --background --factory-startup \
        --python agent/scripts/generate-product-3d.py -- \
        --handle austausch-badheizkorper-handtuchheizkorper-schwarz-elanor-seitlich-offen-kopie \
        --variant "50 x 140"

The `--` separator is required: anything after it is forwarded to this script.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import bpy


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser(description="Generate a parametric 3D radiator from catalog data.")
    p.add_argument("--catalog-root", default="product-catalog", help="Root of product-catalog/")
    p.add_argument("--handle", required=True, help="Product handle (filename without .json)")
    p.add_argument("--variant", default=None, help="Variant size like '50 x 140' (cm). Defaults to first option value.")
    p.add_argument("--out", default=None, help="Output directory. Defaults to <catalog-root>/3d/<handle>/")
    return p.parse_args(argv)


# ---------------------------------------------------------------------------
# Catalog loading
# ---------------------------------------------------------------------------

VARIANT_RE = re.compile(r"(\d+)\s*[x×X]\s*(\d+)")


def load_product(catalog_root: Path, handle: str) -> dict:
    path = catalog_root / "products" / f"{handle}.json"
    if not path.exists():
        raise SystemExit(f"Product JSON not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def pick_variant(product: dict, requested: str | None) -> tuple[int, int, str]:
    """Return (width_cm, height_cm, label) parsed from a size option."""
    size_option = next(
        (o for o in product.get("options", []) if o.get("name_normalized", "").startswith("size_")),
        None,
    )
    if not size_option:
        raise SystemExit("Product has no size-style option; cannot derive geometry.")
    values = size_option["values"]
    label = requested or values[0]
    match = VARIANT_RE.search(label)
    if not match:
        raise SystemExit(f"Could not parse W x H from variant label: {label!r}")
    return int(match.group(1)), int(match.group(2)), label


def color_to_pbr(color: str | None) -> tuple[tuple[float, float, float, float], float, float]:
    """Map catalog color string to (base_color RGBA, roughness, metallic)."""
    c = (color or "weiss").lower()
    if "schwarz" in c or "black" in c:
        return ((0.04, 0.04, 0.04, 1.0), 0.55, 0.05)
    if "anthrazit" in c or "anthracite" in c:
        return ((0.10, 0.11, 0.12, 1.0), 0.55, 0.05)
    if "chrom" in c:
        return ((0.85, 0.85, 0.88, 1.0), 0.10, 1.0)
    return ((0.92, 0.92, 0.91, 1.0), 0.50, 0.05)  # weiss / default


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------

def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name: str, base_rgba, roughness: float, metallic: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def add_cylinder(name: str, radius_m: float, length_m: float, location, axis: str, material) -> bpy.types.Object:
    """Add a cylinder along a given axis with `length_m` along that axis."""
    bpy.ops.mesh.primitive_cylinder_add(radius=radius_m, depth=length_m, location=location, vertices=24)
    obj = bpy.context.active_object
    obj.name = name
    if axis == "x":
        obj.rotation_euler = (0.0, math.radians(90), 0.0)
    elif axis == "y":
        obj.rotation_euler = (math.radians(90), 0.0, 0.0)
    # axis == "z" is default (cylinder is Z-aligned)
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def add_bracket(name: str, location, material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (0.04, 0.025, 0.06)  # 80 x 50 x 120 mm
    obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------------------
# Towel-warmer geometry (ELANOR / ALPHA / KIRA / ELMAR / PLATON / MIRA)
# ---------------------------------------------------------------------------

def build_towel_warmer(width_cm: int, height_cm: int, material) -> None:
    width_m = width_cm / 100.0
    height_m = height_cm / 100.0

    rail_radius = 0.015      # 30 mm dia
    tube_radius = 0.0125     # 25 mm dia
    inset = rail_radius      # how far the cross-tube ends sit inside the rail centerline
    target_tube_pitch = 0.055  # ~55 mm between cross-tube centers

    # Two vertical side rails, centered on Z=0 (so model is upright on +Z when imported)
    rail_x = (width_m / 2.0) - rail_radius
    add_cylinder("Rail.L", rail_radius, height_m, location=(-rail_x, 0.0, height_m / 2.0), axis="z", material=material)
    add_cylinder("Rail.R", rail_radius, height_m, location=( rail_x, 0.0, height_m / 2.0), axis="z", material=material)

    # Cross-tubes: span between rail centerlines
    tube_length = (2 * rail_x) - 2 * inset + 2 * rail_radius  # touch the rail surfaces
    tube_count = max(6, int(round(height_m / target_tube_pitch)))

    # Leave a margin top/bottom equal to one pitch so tubes don't kiss the cap
    margin = height_m * 0.04
    usable = height_m - 2 * margin
    if tube_count > 1:
        pitch = usable / (tube_count - 1)
    else:
        pitch = 0.0
    for i in range(tube_count):
        z = margin + i * pitch
        add_cylinder(f"Tube.{i:02d}", tube_radius, tube_length, location=(0.0, 0.0, z), axis="x", material=material)

    # Wall-mount brackets (back side, +Y), one near top and one near bottom
    bracket_y = 0.04
    add_bracket("Bracket.Top", location=(0.0, bracket_y, height_m - margin - 0.05), material=material)
    add_bracket("Bracket.Bottom", location=(0.0, bracket_y, margin + 0.05), material=material)


# ---------------------------------------------------------------------------
# Camera + lighting (so a glTF preview looks reasonable)
# ---------------------------------------------------------------------------

def add_camera_and_lights(width_m: float, height_m: float) -> None:
    scene = bpy.context.scene

    # Neutral light-grey world so the GLB/render isn't on a black void.
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.85, 0.85, 0.87, 1.0)
        bg.inputs["Strength"].default_value = 1.0
    scene.world = world

    # Aim point at the geometric center of the radiator.
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0.0, 0.0, height_m / 2.0))
    target = bpy.context.active_object
    target.name = "AimTarget"

    # Camera: front-three-quarter, framed to the diagonal so any size fits.
    diag = math.hypot(width_m, height_m)
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = (diag * 1.1, -diag * 1.6, height_m * 0.55)
    constraint = cam_obj.constraints.new(type="TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    scene.camera = cam_obj

    # Key light (area, front-right)
    key = bpy.data.lights.new("Key", type="AREA")
    key.energy = 1200.0
    key.size = 2.5
    key_obj = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(key_obj)
    key_obj.location = (1.8, -2.2, height_m + 0.5)
    kc = key_obj.constraints.new(type="TRACK_TO")
    kc.target = target
    kc.track_axis = "TRACK_NEGATIVE_Z"
    kc.up_axis = "UP_Y"

    # Fill light (area, front-left, softer)
    fill = bpy.data.lights.new("Fill", type="AREA")
    fill.energy = 400.0
    fill.size = 3.5
    fill_obj = bpy.data.objects.new("Fill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.location = (-2.0, -1.4, height_m * 0.7)
    fc = fill_obj.constraints.new(type="TRACK_TO")
    fc.target = target
    fc.track_axis = "TRACK_NEGATIVE_Z"
    fc.up_axis = "UP_Y"

    # Render settings: square-ish portrait, EEVEE Next, modest samples for speed.
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    if "BLENDER_EEVEE_NEXT" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}:
        scene.render.engine = "BLENDER_EEVEE_NEXT"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_outputs(out_dir: Path, basename: str) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    blend_path = out_dir / f"{basename}.blend"
    glb_path = out_dir / f"{basename}.glb"

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )
    return blend_path, glb_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def variant_slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def main() -> None:
    args = parse_args()
    catalog_root = Path(args.catalog_root).resolve()
    product = load_product(catalog_root, args.handle)
    width_cm, height_cm, label = pick_variant(product, args.variant)

    out_dir = Path(args.out).resolve() if args.out else (catalog_root / "3d" / args.handle)
    basename = variant_slug(label)

    print(f"[3d] handle={args.handle} series={product.get('series')} color={product.get('color')} variant={label} ({width_cm}x{height_cm} cm)")

    reset_scene()
    base_rgba, roughness, metallic = color_to_pbr(product.get("color"))
    material = make_material(f"Mat_{product.get('color', 'default')}", base_rgba, roughness, metallic)

    build_towel_warmer(width_cm, height_cm, material)
    add_camera_and_lights(width_cm / 100.0, height_cm / 100.0)

    blend_path, glb_path = export_outputs(out_dir, basename)
    print(f"[3d] wrote {blend_path}")
    print(f"[3d] wrote {glb_path}")


if __name__ == "__main__":
    main()
