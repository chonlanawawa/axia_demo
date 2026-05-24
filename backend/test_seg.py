"""
Quick segmentation diagnostic — run from backend/ dir:
    python test_seg.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import torch

from utils.preprocessing import preprocess_dicom_bytes, build_seg_input_25d
from models.segmentor import UNetResNet50

DEVICE = torch.device("cpu")
MODEL_DIR = Path(__file__).parent.parent / "model"

# ── load seg models ──────────────────────────────────────────────────────────
print("Loading seg_s1 (dropout=0.0) ...")
seg_s1 = UNetResNet50(in_channels=3, use_imagenet=False, dropout=0.0)
ckpt = torch.load(MODEL_DIR / "segmentation" / "stage1_best.pt", map_location=DEVICE, weights_only=False)
sd = ckpt.get("model_state_dict", ckpt.get("state_dict", ckpt))
seg_s1.load_state_dict(sd if isinstance(sd, dict) else ckpt, strict=True)
seg_s1.eval()
print("  seg_s1 loaded ✓")

print("Loading seg_s2 (dropout=0.15) ...")
seg_s2 = UNetResNet50(in_channels=3, use_imagenet=False, dropout=0.15)
ckpt2 = torch.load(MODEL_DIR / "segmentation" / "stage2_best.pt", map_location=DEVICE, weights_only=False)
sd2 = ckpt2.get("model_state_dict", ckpt2.get("state_dict", ckpt2))
seg_s2.load_state_dict(sd2 if isinstance(sd2, dict) else ckpt2, strict=True)
seg_s2.eval()
print("  seg_s2 loaded ✓\n")

# ── test cases ───────────────────────────────────────────────────────────────
DEMO = Path(__file__).parent.parent / "demo_images"

cases = [
    ("hemorrhage", DEMO / "hemorrhage_ICH"),
    ("hemorrhage", DEMO / "hemorrhage_SDH"),
    ("ischemic",   DEMO / "ischemic"),
]

@torch.no_grad()
def run(model, seg_arrays):
    z = len(seg_arrays) // 2
    x = build_seg_input_25d(seg_arrays, z).to(DEVICE)
    logit = model(x)
    prob = torch.sigmoid(logit).squeeze().numpy()
    return prob

for label, folder in cases:
    dcms = sorted(folder.glob("*.dcm"))
    if not dcms:
        print(f"[{label}] No DICOMs found in {folder}")
        continue

    # preprocess first 3 slices
    seg_arrays = []
    for dcm in dcms[:3]:
        data = dcm.read_bytes()
        _, seg_a, meta = preprocess_dicom_bytes(data)
        seg_arrays.append(seg_a)
        # print window tags used
        import pydicom, io as _io
        ds = pydicom.dcmread(_io.BytesIO(data), force=True)
        wc = getattr(ds, 'WindowCenter', 'N/A')
        ww = getattr(ds, 'WindowWidth', 'N/A')
        lo, hi = np.percentile(seg_a, [1, 99])
        print(f"  {dcm.name}: WC={wc}  WW={ww}  seg_arr mean={seg_a.mean():.3f}  [p1={lo:.3f} p99={hi:.3f}]")

    model = seg_s1 if label == "hemorrhage" else seg_s2
    prob = run(model, seg_arrays)
    for t in [0.25, 0.30, 0.40, 0.50]:
        px = (prob >= t).sum()
        print(f"  thresh={t}: {px} pixels")
    print(f"[{label}] max_prob={prob.max():.4f}  mean={prob.mean():.4f}\n")

print("Done.")
