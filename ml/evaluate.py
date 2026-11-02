"""Evaluate a trained checkpoint on the held-out TEST split.

    python evaluate.py --data-dir data/HAM10000/splits --ckpt ../backend/weights/dermavision_effnet_b0.pt

Look at per-class recall (sensitivity), especially melanoma, not just overall accuracy: with ~67% nevi in the data,
a model that always says "nevus" already scores ~67% accuracy.
"""
import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader

from common import SkinDataset, build_model, eval_transform


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--ckpt", default="../backend/weights/dermavision_effnet_b0.pt")
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    names, temp = ckpt["class_names"], ckpt.get("temperature", 1.0)
    model = build_model(len(names), pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.to(device).eval()

    ds = SkinDataset(Path(args.data_dir) / "test.csv", eval_transform)
    dl = DataLoader(ds, args.batch_size, num_workers=args.workers)
    probs, labels = [], []
    with torch.no_grad():
        for x, y in dl:
            probs.append(torch.softmax(model(x.to(device)).cpu() / temp, 1))
            labels.append(y)
    probs, y = torch.cat(probs).numpy(), torch.cat(labels).numpy()
    pred = probs.argmax(1)

    print(classification_report(y, pred, target_names=names, digits=3, zero_division=0))
    cm = confusion_matrix(y, pred, labels=range(len(names)))

    # Expected calibration error: gap between stated confidence and actual accuracy.
    conf, correct = probs.max(1), (pred == y).astype(float)
    bins, ece = np.linspace(0, 1, 11), 0.0
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            ece += m.mean() * abs(correct[m].mean() - conf[m].mean())
    print(f"accuracy {correct.mean():.3f}   expected calibration error {ece:.3f}")

    mel = names.index("mel")
    mel_true = y == mel
    print(f"melanoma sensitivity {(pred[mel_true] == mel).mean():.3f}   "
          f"specificity {(pred[~mel_true] != mel).mean():.3f}")

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(cm / cm.sum(1, keepdims=True).clip(1), cmap="Blues")
    ax.set_xticks(range(len(names)), names, rotation=45)
    ax.set_yticks(range(len(names)), names)
    for i in range(len(names)):
        for j in range(len(names)):
            ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=8)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    fig.tight_layout()
    out = Path(args.ckpt).with_name("confusion_matrix.png")
    fig.savefig(out, dpi=150)
    print("saved", out)


if __name__ == "__main__":
    main()
