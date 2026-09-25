"""
contour_export.py - Images rendered by MAPDL's own PNG device (PRD §14.8):

    geometry.png                       envelope coloured by material
    mesh.png                           element outlines
    contour_frames/envelope_hNNN.png   envelope temperature (air hidden)
    contour_frames/cutaway_hNNN.png    vertical cut through the rooms,
                                       showing room air + wall gradients
    temperature_animation.mp4|.gif     cutaway frames, if a writer exists
"""

import shutil
from pathlib import Path

import numpy as np

FRAME_FRACTIONS = (0.25, 0.5, 0.75, 1.0)


class _Plan:
    """MAPDL finishes writing a PNG only when the next plot starts (or at
    /SHOW,CLOSE), so plots are issued in order and the finished files are
    paired with their targets afterwards."""

    def __init__(self, mapdl):
        self.mapdl = mapdl
        self.work = Path(mapdl.directory)
        self.before = {p.name for p in self.work.glob("*.png")}
        self.targets = []

    def plot(self, target, commands):
        for c in commands:
            self.mapdl.run(c, mute=True)
        self.targets.append(Path(target))

    def collect(self):
        new = sorted(p for p in self.work.glob("*.png")
                     if p.name not in self.before and p.stat().st_size > 256)
        if len(new) != len(self.targets):
            raise RuntimeError(f"expected {len(self.targets)} PNGs from MAPDL, got {len(new)}")
        for src, dst in zip(new, self.targets):
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), dst)
        for p in self.work.glob("*.png"):
            if p.name not in self.before:
                p.unlink(missing_ok=True)
        return self.targets


def _select_solids(mapdl, info):
    air = [n for k, n in info["matnum"].items() if k.startswith("air:")]
    mapdl.allsel()
    for n in air:
        mapdl.esel("U", "MAT", "", n)


def _select_cutaway(mapdl, model):
    y_mid = float(np.mean([(z["plo"][1] + z["phi"][1]) / 2 for z in model.zones.values()]))
    mapdl.allsel()
    mapdl.esel("S", "CENT", "Y", float(model.ys[0]) - 1.0, y_mid)
    mapdl.nsle("S")


def export_images(mapdl, model, info, n_hours, job_dir, bc):
    job_dir = Path(job_dir)
    frames_dir = job_dir / "contour_frames"
    out = {}
    mapdl.run("/SHOW,PNG", mute=True)
    mapdl.run("/GFILE,1200", mute=True)
    mapdl.run("/VUP,1,Z", mute=True)
    mapdl.run("/VIEW,1,1,-2,1", mute=True)
    mapdl.run("/ANG,1", mute=True)
    mapdl.run("/PLOPTS,INFO,3", mute=True)
    mapdl.run("/RGB,INDEX,100,100,100,0", mute=True)
    mapdl.run("/RGB,INDEX,0,0,0,15", mute=True)

    plan = _Plan(mapdl)
    _select_solids(mapdl, info)
    plan.plot(job_dir / "geometry.png",
              ["/TITLE,Envelope materials (room air hidden)", "/NUMBER,1",
               "/PNUM,MAT,1", "/EDGE,1,0", "EPLOT"])
    plan.plot(job_dir / "mesh.png",
              ["/TITLE,SOLID70 mesh", "/PNUM,MAT,0", "/NUMBER,0", "/EDGE,1,1", "EPLOT"])
    out["geometry_png"], out["mesh_png"] = "geometry.png", "mesh.png"

    steps = sorted({max(1, min(n_hours, round(f * n_hours))) for f in FRAME_FRACTIONS})
    anim_steps = list(range(1, n_hours + 1, max(1, n_hours // 24)))
    frames = []
    mapdl.run("/EDGE,1,0", mute=True)
    for k in sorted(set(steps) | set(anim_steps)):
        mapdl.set(time=k * 3600.0)
        label = str(bc["timestamp"].iloc[k - 1])[:16]
        if k in steps:
            _select_solids(mapdl, info)
            plan.plot(frames_dir / f"envelope_h{k:03d}.png",
                      ["/VIEW,1,1,-2,1",
                       f"/TITLE,Envelope temperature  hour {k}  ({label} +1h)", "PLNSOL,TEMP"])
            out[f"envelope_h{k:03d}"] = f"contour_frames/envelope_h{k:03d}.png"
        _select_cutaway(mapdl, model)
        target = frames_dir / f"cutaway_h{k:03d}.png"
        plan.plot(target, ["/VIEW,1,1.2,2,1.1",
                           f"/TITLE,Cutaway (south half, seen from north)  hour {k}  ({label} +1h)",
                           "PLNSOL,TEMP"])
        frames.append(target)
        if k in steps:
            out[f"cutaway_h{k:03d}"] = f"contour_frames/cutaway_h{k:03d}.png"
    mapdl.run("/SHOW,CLOSE", mute=True)
    mapdl.allsel()
    plan.collect()
    anim = _animate(frames, job_dir)
    if anim:
        out["animation"] = anim
    else:
        out["animation"] = None
        out["animation_note"] = "no video writer available (imageio/Pillow)"
    return out


def _animate(frames, job_dir):
    if len(frames) < 2:
        return None
    try:
        import imageio.v2 as imageio
        imgs = [imageio.imread(f) for f in frames]
        path = job_dir / "temperature_animation.mp4"
        try:
            imageio.mimsave(path, imgs, fps=4)
            if path.stat().st_size > 1024:
                return path.name
        except Exception:                                      # noqa: BLE001
            pass
        path.unlink(missing_ok=True)            # no ffmpeg backend: drop the stub
    except ImportError:
        pass
    try:
        from PIL import Image
        imgs = [Image.open(f).convert("P", palette=Image.ADAPTIVE) for f in frames]
        path = job_dir / "temperature_animation.gif"
        imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=250, loop=0)
        return path.name
    except Exception:                                          # noqa: BLE001
        return None
