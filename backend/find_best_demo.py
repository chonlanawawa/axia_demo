# Scan CQ500 DICOMs and find cases with highest hemorrhage segmentation scores.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import torch
from utils.preprocessing import preprocess_dicom_bytes, build_seg_input_25d
from models.segmentor import UNetResNet50

DEVICE = torch.device("cpu")
MODEL_DIR = Path(__file__).parent.parent / "model"
CQ500_RAW = Path("E:/Bloodclot/data/organized/stage1_hemorrhage/cq500/raw")
AISD_DIR  = Path("E:/Bloodclot/data/organized/stage2_ischemia/aisd")
CPAISD_DIR= Path("E:/Bloodclot/data/organized/stage2_ischemia/cpaisd")

print("Loading models...")
seg_s1 = UNetResNet50(in_channels=3, use_imagenet=False, dropout=0.0)
ckpt = torch.load(MODEL_DIR / "segmentation" / "stage1_best.pt", map_location=DEVICE, weights_only=False)
sd = ckpt.get("model_state_dict", ckpt.get("state_dict", ckpt))
seg_s1.load_state_dict(sd if isinstance(sd, dict) else ckpt, strict=True)
seg_s1.eval()

seg_s2 = UNetResNet50(in_channels=3, use_imagenet=False, dropout=0.15)
ckpt2 = torch.load(MODEL_DIR / "segmentation" / "stage2_best.pt", map_location=DEVICE, weights_only=False)
sd2 = ckpt2.get("model_state_dict", ckpt2.get("state_dict", ckpt2))
seg_s2.load_state_dict(sd2 if isinstance(sd2, dict) else ckpt2, strict=True)
seg_s2.eval()
print("Models loaded.\n")

@torch.no_grad()
def score_slices(dcm_paths, model):
    seg_arrays = []
    for p in dcm_paths:
        try:
            _, seg_a, _ = preprocess_dicom_bytes(p.read_bytes())
            seg_arrays.append(seg_a)
        except Exception as e:
            return None, None, str(e)
    if not seg_arrays:
        return None, None, "no arrays"
    best_prob, best_z = 0.0, 0
    for z in range(len(seg_arrays)):
        x = build_seg_input_25d(seg_arrays, z).to(DEVICE)
        prob = torch.sigmoid(model(x)).squeeze().numpy()
        mp = float(prob.max())
        if mp > best_prob:
            best_prob, best_z = mp, z
    return best_prob, best_z, None

# ── Hemorrhage: scan CQ500 cases ────────────────────────────────────────────
print("=== HEMORRHAGE (CQ500) ===")
results = []
for qct_dir in sorted(CQ500_RAW.iterdir()):
    if not qct_dir.is_dir():
        continue
    for case_dir in sorted(qct_dir.iterdir()):
        if not case_dir.is_dir():
            continue
        dcms = sorted(case_dir.rglob("*.dcm"))
        if len(dcms) < 3:
            continue
        # Use middle 5 slices for speed
        mid = len(dcms) // 2
        sample = dcms[max(0, mid-2):mid+3]
        best_prob, best_z, err = score_slices(sample, seg_s1)
        if err or best_prob is None:
            continue
        results.append((best_prob, best_z, case_dir.name, len(dcms), sample))
        print(f"  {case_dir.name[:40]:40s}  slices={len(dcms):3d}  max_prob={best_prob:.4f}  best_z={best_z}")

results.sort(reverse=True)
print(f"\nTop 3 hemorrhage cases:")
for prob, z, name, n, paths in results[:3]:
    print(f"  max_prob={prob:.4f}  z={z}  {name}")
    for p in paths:
        print(f"    {p}")

# ── Ischemic: scan AISD + CPAISD ────────────────────────────────────────────
print("\n=== ISCHEMIC (AISD + CPAISD) ===")
isc_results = []
for src_dir in [AISD_DIR, CPAISD_DIR]:
    if not src_dir.exists():
        continue
    for case_dir in sorted(src_dir.iterdir()):
        if not case_dir.is_dir():
            continue
        dcms = sorted(case_dir.rglob("*.dcm"))
        if len(dcms) < 3:
            continue
        mid = len(dcms) // 2
        sample = dcms[max(0, mid-2):mid+3]
        best_prob, best_z, err = score_slices(sample, seg_s2)
        if err or best_prob is None:
            continue
        isc_results.append((best_prob, best_z, case_dir.name, len(dcms), sample, src_dir.name))
        print(f"  [{src_dir.name}] {case_dir.name[:35]:35s}  slices={len(dcms):3d}  max_prob={best_prob:.4f}")

isc_results.sort(reverse=True)
print(f"\nTop 3 ischemic cases:")
for prob, z, name, n, paths, src in isc_results[:3]:
    print(f"  max_prob={prob:.4f}  z={z}  [{src}] {name}")
    for p in paths:
        print(f"    {p}")
