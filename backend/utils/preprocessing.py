"""
Image preprocessing utilities.

DICOM → 3-channel windowed tensor  (for classification)
PNG/JPG → grayscale float array     (for segmentation 2.5D stacking)
PNG/JPG → 3-channel replicated      (for classification when DICOM unavailable)
"""

import io
import base64
import numpy as np
import cv2
from PIL import Image

# CT windowing presets: (center, width)
# brain / subdural / bone — from training notebook
WINDOWS = [(40, 80), (80, 200), (600, 2800)]
IMG_SIZE = 256


# ---------------------------------------------------------------------------
# DICOM helpers
# ---------------------------------------------------------------------------

def _dicom_to_hu(ds) -> np.ndarray:
    """Convert raw DICOM pixel array to Hounsfield Units."""
    img = ds.pixel_array.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1.0))
    intercept = float(getattr(ds, "RescaleIntercept", 0.0))
    img = img * slope + intercept
    phot = str(getattr(ds, "PhotometricInterpretation", "")).upper()
    if phot == "MONOCHROME1":
        img = img.max() - img
    return img


def _apply_window(img_hu: np.ndarray, center: float, width: float) -> np.ndarray:
    lo = center - width / 2
    hi = center + width / 2
    x = np.clip(img_hu, lo, hi)
    return ((x - lo) / (hi - lo + 1e-6)).astype(np.float32)


def _window_for_seg(hu: np.ndarray, ds) -> np.ndarray:
    """
    Normalise HU array for segmentation input.
    Primary: DICOM's own WindowCenter/WindowWidth tags (matches CQ500 training export).
    Fallback: brain window (40/80) when tags are absent.
    """
    wc = getattr(ds, 'WindowCenter', None)
    ww = getattr(ds, 'WindowWidth', None)
    if wc is not None and ww is not None:
        def _scalar(v):
            return float(v[0]) if hasattr(v, '__len__') else float(v)
        try:
            result = _apply_window(hu, _scalar(wc), _scalar(ww))
            return cv2.resize(result, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
        except Exception:
            pass
    # Fallback: standard brain window
    result = _apply_window(hu, 40, 80)
    return cv2.resize(result, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)


def _extract_dicom_spacing(ds):
    """Return (pixel_spacing_mm, slice_thickness_mm) or (None, None)."""
    try:
        ps = ds.PixelSpacing
        px_mm = (float(ps[0]) + float(ps[1])) / 2.0
        st_mm = float(getattr(ds, "SliceThickness", 0) or 0)
        if px_mm > 0 and st_mm > 0:
            return px_mm, st_mm
    except Exception:
        pass
    return None, None


def preprocess_dicom_bytes(data: bytes) -> tuple:
    """
    Parse DICOM from raw bytes.

    Returns:
        clf_tensor  : np.ndarray (3, 256, 256) float32  — 3-window for classification
        seg_arr     : np.ndarray (256, 256) float32      — normalised [0,1] for segmentation
        meta        : dict with pixel_spacing_mm, slice_thickness_mm  (or None values)
    """
    import pydicom
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    hu = _dicom_to_hu(ds)

    # Classification tensor: 3 windows stacked as channels
    chans = []
    for c, w in WINDOWS:
        ch = _apply_window(hu, c, w)
        ch = cv2.resize(ch, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
        chans.append(ch)
    clf_tensor = np.stack(chans, axis=0)  # (3, 256, 256)

    # Segmentation array: use DICOM's own window/level (matches training export),
    # fall back to percentile normalization if tags are absent.
    seg_arr = _window_for_seg(hu, ds)

    px_mm, st_mm = _extract_dicom_spacing(ds)
    meta = {"pixel_spacing_mm": px_mm, "slice_thickness_mm": st_mm}

    return clf_tensor, seg_arr, meta


# ---------------------------------------------------------------------------
# PNG / JPG helpers
# ---------------------------------------------------------------------------

def preprocess_image_bytes(data: bytes) -> tuple:
    """
    Parse PNG/JPG from raw bytes.

    Returns:
        clf_tensor : np.ndarray (3, 256, 256) float32  — grayscale replicated to 3ch
        seg_arr    : np.ndarray (256, 256) float32      — normalised [0,1]
    """
    pil = Image.open(io.BytesIO(data)).convert("L")      # force grayscale
    arr = np.array(pil, dtype=np.float32) / 255.0

    arr_resized = cv2.resize(arr, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    arr_resized = np.clip(arr_resized, 0.0, 1.0)

    # Replicate single channel to 3 — best effort for classification model
    clf_tensor = np.stack([arr_resized, arr_resized, arr_resized], axis=0)  # (3, H, W)
    seg_arr = arr_resized  # (H, W)

    return clf_tensor, seg_arr


# ---------------------------------------------------------------------------
# DICOM → preview PNG (brain window, base64)
# ---------------------------------------------------------------------------

def dicom_to_preview_b64(data: bytes) -> str:
    """
    Convert DICOM bytes to a base64-encoded PNG suitable for browser display.
    Uses the brain window (40/80) for display.
    Returns a data-URL string: 'data:image/png;base64,...'
    """
    import pydicom
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    hu = _dicom_to_hu(ds)
    win = _apply_window(hu, 40, 80)
    img_8bit = (win * 255).astype(np.uint8)
    pil_img = Image.fromarray(img_8bit, mode='L').resize(
        (IMG_SIZE, IMG_SIZE), Image.LANCZOS
    )
    buf = io.BytesIO()
    pil_img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f'data:image/png;base64,{b64}'


# ---------------------------------------------------------------------------
# Tensor builders for model input
# ---------------------------------------------------------------------------

def build_clf_batch(clf_tensors: list, n_slices: int = 32) -> "torch.Tensor":
    """
    Stack list of (3, H, W) arrays into (1, 32, 3, H, W) torch tensor.
    Pads by repetition if fewer than n_slices; samples evenly if more.
    """
    import torch
    N = len(clf_tensors)
    if N <= n_slices:
        indices = list(range(N))
        while len(indices) < n_slices:
            indices.extend(range(N))
        indices = indices[:n_slices]
    else:
        indices = np.linspace(0, N - 1, n_slices, dtype=int).tolist()

    stacked = np.stack([clf_tensors[i] for i in indices], axis=0)  # (32, 3, H, W)
    return torch.tensor(stacked, dtype=torch.float32).unsqueeze(0)  # (1, 32, 3, H, W)


def build_seg_input_25d(seg_arrays: list, z: int) -> "torch.Tensor":
    """
    Build 2.5D input tensor for segmentation model.
    Channels: (z-1, z, z+1), clamped at boundaries.

    Returns: torch.Tensor (1, 3, H, W)
    """
    import torch
    Z = len(seg_arrays)
    prev = seg_arrays[max(0, z - 1)]
    curr = seg_arrays[z]
    nxt  = seg_arrays[min(Z - 1, z + 1)]
    stacked = np.stack([prev, curr, nxt], axis=0).astype(np.float32)  # (3, H, W)
    return torch.from_numpy(stacked).unsqueeze(0)                      # (1, 3, H, W)
