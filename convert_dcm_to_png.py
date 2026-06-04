import os
import numpy as np
import pydicom
from pydicom.pixel_data_handlers.util import apply_voi_lut
from pathlib import Path
from PIL import Image

SRC = Path("demo_images")
DST = Path("demo_image_PNG")

def dcm_to_png(dcm_path: Path, png_path: Path):
    ds = pydicom.dcmread(str(dcm_path))
    arr = ds.pixel_array.astype(np.float32)

    # Apply rescale slope/intercept if present (Hounsfield units)
    slope = float(getattr(ds, "RescaleSlope", 1))
    intercept = float(getattr(ds, "RescaleIntercept", 0))
    arr = arr * slope + intercept

    # Normalize to 0-255
    arr_min, arr_max = arr.min(), arr.max()
    if arr_max > arr_min:
        arr = (arr - arr_min) / (arr_max - arr_min) * 255.0
    else:
        arr = np.zeros_like(arr)

    img = Image.fromarray(arr.astype(np.uint8))
    png_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(png_path))

converted, failed = 0, 0
for dcm_path in sorted(SRC.rglob("*.dcm")):
    rel = dcm_path.relative_to(SRC)
    png_path = DST / rel.with_suffix(".png")
    try:
        dcm_to_png(dcm_path, png_path)
        print(f"  OK  {rel}")
        converted += 1
    except Exception as e:
        print(f" ERR  {rel}: {e}")
        failed += 1

print(f"\nDone: {converted} converted, {failed} failed")
