"""
Post-processing of segmentation masks:
  - Volume estimation (mL) from DICOM spacing
  - Midline shift estimation (mm) from mask asymmetry
  - ASPECTS score estimation from ischemic mask coverage
  - Mask → RGBA overlay PNG (base64 encoded) for frontend display

NOTE on subtypes:
  Neither the hemorrhage nor the ischemic segmentation model predicts subtypes.
  Both models output a single binary mask (Conv2d → 1 channel).
  Subtype labels (ICH/IVH/SAH/SDH/EDH, AISD/CPAISD) were dataset metadata used
  during training, not separate output heads.  Subtype detection is therefore
  not available without training dedicated classifier heads.
"""

import io
import base64
import numpy as np
from PIL import Image


# ---------------------------------------------------------------------------
# Volume
# ---------------------------------------------------------------------------

def compute_volume(masks: list, dicom_metas: list) -> float | None:
    """
    Estimate total hemorrhage volume in mL.
    masks       : list of (H, W) binary float arrays, one per slice
    dicom_metas : list of dicts with pixel_spacing_mm and slice_thickness_mm
    """
    total_voxels = 0
    voxel_vol_mm3 = None

    for mask, meta in zip(masks, dicom_metas):
        if meta is None:
            continue
        px_mm = meta.get("pixel_spacing_mm")
        st_mm = meta.get("slice_thickness_mm")
        if not px_mm or not st_mm:
            continue
        voxel_vol_mm3 = px_mm * px_mm * st_mm
        total_voxels += int((mask > 0.5).sum())

    if voxel_vol_mm3 is None or total_voxels == 0:
        return None

    return round(total_voxels * voxel_vol_mm3 / 1000.0, 2)   # mm³ → mL


# ---------------------------------------------------------------------------
# Midline shift
# ---------------------------------------------------------------------------

def compute_midline_shift(masks: list, dicom_metas: list) -> float | None:
    """
    Estimate midline shift in mm using mask centroid vs anatomical midline.
    Uses the slice with the largest mask area.
    """
    best_area = 0
    best_mask = None
    best_meta = None

    for mask, meta in zip(masks, dicom_metas):
        area = (mask > 0.5).sum()
        if area > best_area:
            best_area = area
            best_mask = mask
            best_meta = meta

    if best_mask is None or best_area == 0:
        return None

    binary = (best_mask > 0.5)
    ys, xs = np.where(binary)
    if len(xs) == 0:
        return None

    centroid_x = float(xs.mean())
    midline_x  = best_mask.shape[1] / 2.0
    shift_px   = abs(centroid_x - midline_x)

    if best_meta and best_meta.get("pixel_spacing_mm"):
        shift_mm = shift_px * best_meta["pixel_spacing_mm"]
    else:
        # Assume ~0.5 mm/pixel as rough fallback (typical head CT)
        shift_mm = shift_px * 0.5

    return round(float(shift_mm), 2)


# ---------------------------------------------------------------------------
# ASPECTS score
# ---------------------------------------------------------------------------

def estimate_aspects(slice_results: list) -> int:
    """
    Rough geometric ASPECTS estimate from mask coverage.
    Divides the axial slice into 10 territory zones and checks involvement.
    NOT clinically validated — approximation only.
    """
    affected = set()

    for sr in slice_results:
        if not sr.get("maskFound"):
            continue
        mask = sr.get("maskArray")
        if mask is None:
            continue

        h, w = mask.shape
        binary = (mask > 0.5).astype(np.uint8)

        # Define 10 approximate ASPECTS regions by quadrant/zone
        zones = {
            "M1":  (0,   h//3,  0,   w//2),      # Ant cortex left
            "M2":  (0,   h//3,  w//2, w),          # Ant cortex right
            "M3":  (h//3, 2*h//3, 0, w//2),        # Mid cortex left
            "M4":  (h//3, 2*h//3, w//2, w),         # Mid cortex right
            "M5":  (2*h//3, h, 0, w//3),            # Post cortex left
            "M6":  (2*h//3, h, 2*w//3, w),          # Post cortex right
            "C":   (h//3, 2*h//3, 2*w//5, 3*w//5), # Caudate (central)
            "L":   (h//3, 2*h//3, w//3, 2*w//3),   # Lentiform
            "IC":  (h//5, 4*h//5, 2*w//5, 3*w//5), # Internal capsule
            "I":   (h//4, 3*h//4, w//4, 3*w//4),   # Insular ribbon
        }

        for name, (y1, y2, x1, x2) in zones.items():
            region = binary[y1:y2, x1:x2]
            if region.sum() > 5:    # at least 5 px involvement
                affected.add(name)

    return max(0, 10 - len(affected))




# ---------------------------------------------------------------------------
# Mask → base64 RGBA overlay PNG
# ---------------------------------------------------------------------------

_COLORS = {
    "hemorrhage": (220, 60,  60,  140),   # red, semi-transparent
    "ischemic":   ( 60, 120, 220, 120),   # blue, semi-transparent
}


def mask_to_overlay_b64(mask: np.ndarray, mask_type: str) -> str:
    """
    Convert binary mask (H, W) float32 to base64-encoded RGBA PNG overlay.
    Transparent where mask=0, colored where mask=1.
    """
    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    color = _COLORS.get(mask_type, (150, 150, 50, 120))

    binary = (mask > 0.5)
    rgba[binary] = color

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"
