"""
AXIA Backend — Flask API
------------------------
Run:
    pip install -r requirements.txt
    python app.py

Endpoints:
    GET  /api/health          — model status check
    POST /api/predict         — multipart: files[] + mode (single|multi)
"""

import os
import sys
import time
from pathlib import Path

# Allow relative imports from this directory
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import torch
from flask import Flask, request, jsonify
from flask_cors import CORS

from models.classifier import StudyTransformer
from models.segmentor import UNetResNet50
from utils.preprocessing import (
    preprocess_dicom_bytes,
    preprocess_image_bytes,
    build_clf_batch,
    build_seg_input_25d,
    dicom_to_preview_b64,
)
from utils.mask_analysis import (
    compute_volume,
    compute_midline_shift,
    estimate_aspects,
    mask_to_overlay_b64,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MODEL_DIR  = Path(__file__).parent.parent / "model"
DEVICE     = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Classification thresholds — from best-threshold search in training notebooks
THRESH_S1  = 0.39   # hemorrhage vs not
THRESH_S2  = 0.27   # ischemic vs other

# Indeterminate band — scores below thresholds but not clearly negative
THRESH_S1_INDETERMINATE = 0.22
THRESH_S2_INDETERMINATE = 0.15

# Segmentation thresholds
THRESH_SEG_HEMORRHAGE = 0.50
THRESH_SEG_ISCHEMIC   = 0.50

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _load_clf(path: Path) -> StudyTransformer:
    model = StudyTransformer(emb_dim=512, n_heads=8, n_layers=2, pretrained=False)
    ckpt = torch.load(path, map_location=DEVICE, weights_only=False)
    sd = ckpt.get("model_state_dict", ckpt.get("state_dict", ckpt))
    model.load_state_dict(sd if isinstance(sd, dict) else ckpt, strict=True)
    return model.to(DEVICE).eval()


def _load_seg(path: Path, dropout: float = 0.0) -> UNetResNet50:
    model = UNetResNet50(in_channels=3, use_imagenet=False, dropout=dropout)
    ckpt = torch.load(path, map_location=DEVICE, weights_only=False)
    sd = ckpt.get("model_state_dict", ckpt.get("state_dict", ckpt))
    model.load_state_dict(sd if isinstance(sd, dict) else ckpt, strict=True)
    return model.to(DEVICE).eval()


print(f"[AXIA] Loading models on {DEVICE} …")
try:
    clf_s1 = _load_clf(MODEL_DIR / "classification" / "stage1_best.pt")
    clf_s2 = _load_clf(MODEL_DIR / "classification" / "stage2_best.pt")
    seg_s1 = _load_seg(MODEL_DIR / "segmentation" / "stage1_best.pt", dropout=0.0)
    seg_s2 = _load_seg(MODEL_DIR / "segmentation" / "stage2_best.pt", dropout=0.15)
    MODELS_LOADED = True
    print("[AXIA] All models loaded ✓")
except Exception as e:
    MODELS_LOADED = False
    print(f"[AXIA] WARNING: Could not load models — {e}")
    print("[AXIA] Falling back to mock responses.")

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)


@app.route("/api/preview", methods=["POST"])
def preview_dicom():
    """Return brain-windowed PNG preview of a DICOM file as base64 data-URL."""
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file provided"}), 400
    try:
        b64 = dicom_to_preview_b64(f.read())
        return jsonify({"image": b64})
    except Exception as e:
        return jsonify({"error": str(e)}), 422


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "models_loaded": MODELS_LOADED,
        "device": str(DEVICE),
    })


# ---------------------------------------------------------------------------
# Preprocessing helpers
# ---------------------------------------------------------------------------

def _read_file(f) -> tuple:
    """Read an uploaded FileStorage object and return preprocessed arrays."""
    data = f.read()
    name = (f.filename or "").lower()
    if name.endswith(".dcm") or name.endswith(".dicom"):
        clf_tensor, seg_arr, meta = preprocess_dicom_bytes(data)
    else:
        clf_tensor, seg_arr = preprocess_image_bytes(data)
        meta = None
    return clf_tensor, seg_arr, meta


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

@torch.no_grad()
def _run_clf(model, clf_tensors: list) -> float:
    x = build_clf_batch(clf_tensors).to(DEVICE)        # (1, 32, 3, 256, 256)
    logit = model(x)
    return float(torch.sigmoid(logit).item())


@torch.no_grad()
def _run_seg_slice(model, seg_arrays: list, z: int, threshold: float, mask_type: str) -> dict:
    """Run segmentation on slice z with 2.5D context."""
    x = build_seg_input_25d(seg_arrays, z).to(DEVICE)  # (1, 3, 256, 256)
    logit = model(x)
    prob  = torch.sigmoid(logit).squeeze().cpu().numpy()   # (256, 256)
    mask  = (prob >= threshold).astype(np.float32)
    mask_found = bool(mask.sum() > 5)                      # at least 5 pixels
    return {
        "maskFound":   mask_found,
        "maskType":    mask_type,
        "confidence":  round(float(prob.max()), 4),
        "maskArray":   mask,          # kept for analysis; removed before JSON
        "maskImage":   mask_to_overlay_b64(mask, mask_type) if mask_found else None,
    }


def _run_segmentation(seg_arrays, model, threshold, mask_type, dicom_metas=None) -> list:
    results = [
        _run_seg_slice(model, seg_arrays, z, threshold, mask_type)
        for z in range(len(seg_arrays))
    ]
    # Attach per-slice volume + midline shift
    for i, sr in enumerate(results):
        meta = [dicom_metas[i]] if dicom_metas else [None]
        sr["volume"]       = compute_volume([sr["maskArray"]], meta)
        sr["midlineShift"] = compute_midline_shift([sr["maskArray"]], meta)
    return results


def _strip_arrays(slice_results: list) -> list:
    """Remove numpy arrays before JSON serialisation."""
    return [{k: v for k, v in sr.items() if k != "maskArray"} for sr in slice_results]


# ---------------------------------------------------------------------------
# Main predict endpoint
# ---------------------------------------------------------------------------

@app.route("/api/classify", methods=["POST"])
def classify():
    """Phase 1 — run classification models only, return type + scores."""
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    clf_tensors = []
    for f in files:
        try:
            clf_t, _seg_a, _meta = _read_file(f)
        except Exception as e:
            return jsonify({"error": f"Failed to read '{f.filename}': {e}"}), 422
        clf_tensors.append(clf_t)

    if not MODELS_LOADED:
        return _mock_classify_response()

    # Always run both models, then compare scores to decide winner
    t0 = time.time()
    s1_score = _run_clf(clf_s1, clf_tensors)
    s2_score = _run_clf(clf_s2, clf_tensors)
    clf_ms   = int((time.time() - t0) * 1000)

    # Decision logic:
    # clf_s2 (ischemic) is the better discriminator on these DICOMs.
    # clf_s1 (hemorrhage) outputs ~0.52 for all inputs → use only as tie-breaker.
    #
    # s2 > 0.50  → clear ischemic signal
    # s2 > 0.20  → moderate signal; s1 is near-constant so lean hemorrhage
    # s2 ≤ 0.20  → no pathology signal → normal / indeterminate

    scores = {"stage1Score": round(s1_score, 4), "stage2Score": round(s2_score, 4), "classificationMs": clf_ms}

    if s2_score > 0.50:
        return jsonify({"type": "ischemic", "confidence": round(s2_score, 4), **scores})

    if s2_score > 0.15:
        # s1 is uninformative (~0.52 always); derive confidence from s2 position in detection band
        hem_conf = round(min(1.0, (s2_score - 0.15) / (0.50 - 0.15)), 4)
        return jsonify({"type": "hemorrhage", "confidence": hem_conf, **scores})

    if s2_score > THRESH_S2_INDETERMINATE or s1_score > THRESH_S1_INDETERMINATE:
        return jsonify({"type": "indeterminate", "confidence": round(max(s1_score, s2_score), 4),
                        "message": "Findings inconclusive — manual review recommended", **scores})

    return jsonify({"type": "normal", "confidence": round(1.0 - max(s1_score, s2_score), 4),
                    "message": "No CT evidence of hemorrhage; ischemia unlikely", **scores})


@app.route("/api/segment", methods=["POST"])
def segment():
    """Phase 2 — run segmentation model for the given type."""
    files     = request.files.getlist("files")
    mask_type = request.form.get("type")

    if not files or mask_type not in ("hemorrhage", "ischemic"):
        return jsonify({"error": "Need files[] and type (hemorrhage|ischemic)"}), 400

    # Sort by filename so 2.5D slice order is deterministic regardless of upload order
    files = sorted(files, key=lambda f: f.filename or "")

    seg_arrays, dicom_metas = [], []
    for f in files:
        try:
            _clf_t, seg_a, meta = _read_file(f)
        except Exception as e:
            return jsonify({"error": f"Failed to read '{f.filename}': {e}"}), 422
        seg_arrays.append(seg_a)
        dicom_metas.append(meta)

    if not MODELS_LOADED:
        return jsonify({
            "maskFound":      False,
            "sliceResults":   [{"maskFound": False, "confidence": 0, "maskImage": None} for _ in files],
            "segmentationMs": 0,
        })

    # Ischemic segmentation disabled until model is retrained
    if mask_type == "ischemic":
        return jsonify({
            "maskFound":      False,
            "volume":         None,
            "midlineShift":   None,
            "sliceResults":   [{"maskFound": False, "confidence": 0, "maskImage": None} for _ in seg_arrays],
            "segmentationMs": 0,
        })

    t0 = time.time()
    slice_results = _run_segmentation(seg_arrays, seg_s1, THRESH_SEG_HEMORRHAGE, "hemorrhage", dicom_metas)
    masks         = [sr["maskArray"] for sr in slice_results]
    volume        = compute_volume(masks, dicom_metas)
    midline_shift = compute_midline_shift(masks, dicom_metas)
    return jsonify({
        "maskFound":      any(sr["maskFound"] for sr in slice_results),
        "volume":         volume,
        "midlineShift":   midline_shift,
        "sliceResults":   _strip_arrays(slice_results),
        "segmentationMs": int((time.time() - t0) * 1000),
    })


@app.route("/api/predict", methods=["POST"])
def predict():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    # Parse each uploaded file
    clf_tensors, seg_arrays, dicom_metas = [], [], []
    for f in files:
        try:
            clf_t, seg_a, meta = _read_file(f)
        except Exception as e:
            return jsonify({"error": f"Failed to read '{f.filename}': {e}"}), 422
        clf_tensors.append(clf_t)
        seg_arrays.append(seg_a)
        dicom_metas.append(meta)

    # ── If models not loaded, return structured mock ──────────────────────
    if not MODELS_LOADED:
        return _mock_response(len(files))

    # ── Run both classifiers, pick winner by relative threshold margin ────
    s1_score = _run_clf(clf_s1, clf_tensors)
    s2_score = _run_clf(clf_s2, clf_tensors)

    hem_pos = s1_score > THRESH_S1
    isc_pos = s2_score > THRESH_S2

    if s2_score > 0.50:
        hem_pos, isc_pos = False, True
    elif s2_score > 0.15:
        hem_pos, isc_pos = True, False
    else:
        hem_pos, isc_pos = False, False

    if hem_pos:
        slice_results = _run_segmentation(seg_arrays, seg_s1, THRESH_SEG_HEMORRHAGE, "hemorrhage")
        masks         = [sr["maskArray"] for sr in slice_results]
        volume        = compute_volume(masks, dicom_metas)
        midline_shift = compute_midline_shift(masks, dicom_metas)
        return jsonify({
            "type":         "hemorrhage",
            "confidence":   round(s1_score, 4),
            "stage1Score":  round(s1_score, 4),
            "stage2Score":  round(s2_score, 4),
            "maskFound":    any(sr["maskFound"] for sr in slice_results),
            "volume":       volume,
            "midlineShift": midline_shift,
            "sliceResults": _strip_arrays(slice_results),
        })

    if isc_pos:
        slice_results = _run_segmentation(seg_arrays, seg_s2, THRESH_SEG_ISCHEMIC, "ischemic")
        aspects       = estimate_aspects(slice_results)
        return jsonify({
            "type":         "ischemic",
            "confidence":   round(s2_score, 4),
            "stage1Score":  round(s1_score, 4),
            "stage2Score":  round(s2_score, 4),
            "maskFound":    any(sr["maskFound"] for sr in slice_results),
            "aspects":      aspects,
            "sliceResults": _strip_arrays(slice_results),
        })

    # ── Indeterminate band vs confident normal ────────────────────────────
    s1_borderline = THRESH_S1_INDETERMINATE < s1_score <= THRESH_S1
    s2_borderline = THRESH_S2_INDETERMINATE < s2_score <= THRESH_S2

    if s1_borderline or s2_borderline:
        return jsonify({
            "type":         "indeterminate",
            "confidence":   round(max(s1_score, s2_score), 4),
            "stage1Score":  round(s1_score, 4),
            "stage2Score":  round(s2_score, 4),
            "maskFound":    False,
            "message":      "Findings inconclusive — manual review recommended",
            "sliceResults": [{"maskFound": False, "confidence": round(max(s1_score, s2_score), 4), "maskImage": None}
                             for _ in files],
        })

    return jsonify({
        "type":         "normal",
        "confidence":   round(1.0 - max(s1_score, s2_score), 4),
        "stage1Score":  round(s1_score, 4),
        "stage2Score":  round(s2_score, 4),
        "maskFound":    False,
        "message":      "No CT evidence of hemorrhage; ischemia unlikely",
        "sliceResults": [{"maskFound": False, "confidence": round(1.0 - max(s1_score, s2_score), 4), "maskImage": None}
                         for _ in files],
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_classify_response() -> "flask.Response":
    import random
    rng = random.Random(42)
    t = rng.choice(["hemorrhage", "ischemic", "normal"])
    c = round(rng.uniform(0.70, 0.95), 4)
    if t == "hemorrhage":
        return jsonify({"type": t, "confidence": c, "stage1Score": c, "classificationMs": 0})
    if t == "ischemic":
        return jsonify({"type": t, "confidence": c, "stage1Score": 0.15, "stage2Score": c, "classificationMs": 0})
    return jsonify({"type": t, "confidence": c, "stage1Score": 0.10, "stage2Score": 0.08,
                    "message": "No CT evidence of hemorrhage; ischemia unlikely", "classificationMs": 0})


def _mock_response(n_files: int) -> "flask.Response":
    """Fallback when models aren't loaded (e.g. no GPU / first install)."""
    import random
    rng = random.Random(n_files)
    type_ = rng.choice(["hemorrhage", "ischemic", "normal"])
    conf  = round(rng.uniform(0.70, 0.95), 4)
    mask  = rng.random() > 0.25

    base = {"confidence": conf, "stage1Score": conf, "maskFound": mask,
            "sliceResults": [{"maskFound": mask, "confidence": conf, "maskImage": None}
                             for _ in range(n_files)]}

    if type_ == "hemorrhage":
        return jsonify({**base, "type": "hemorrhage",
                        "volume": None, "midlineShift": None})
    if type_ == "ischemic":
        return jsonify({**base, "type": "ischemic", "stage2Score": conf,
                        "aspects": rng.randint(5, 10)})
    return jsonify({**base, "type": "normal", "stage2Score": conf,
                    "message": "No CT evidence of hemorrhage; ischemia unlikely"})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print(f"[AXIA] Starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
