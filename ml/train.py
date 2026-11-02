"""Fine-tune EfficientNet-B0 on HAM10000.

    python train.py --data-dir data/HAM10000/splits

Phase 1 (warm-up): backbone frozen, only the new classifier head trains.
Phase 2 (fine-tune): everything trains at a lower learning rate with cosine decay.
Afterwards a temperature is fitted on the validation set so the confidence % shown in the app is calibrated.
"""
import argparse
import copy
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import balanced_accuracy_score, f1_score, recall_score
from torch import nn
from torch.utils.data import DataLoader, Subset

from common import CLASS_NAMES, IMG_SIZE, SkinDataset, build_model, eval_transform, train_transform

MEL = CLASS_NAMES.index("mel")


@torch.no_grad()
def predict_logits(model, loader, device):
    model.eval()
    logits, labels = [], []
    for x, y in loader:
        logits.append(model(x.to(device)).float().cpu())
        labels.append(y)
    return torch.cat(logits), torch.cat(labels)


def metrics(logits, labels):
    pred = logits.argmax(1).numpy()
    y = labels.numpy()
    return {
        "accuracy": float((pred == y).mean()),
        "balanced_accuracy": float(balanced_accuracy_score(y, pred)),
        "macro_f1": float(f1_score(y, pred, average="macro", zero_division=0)),
        "melanoma_recall": float(recall_score(y, pred, labels=[MEL], average="macro", zero_division=0)),
    }


def fit_temperature(logits, labels):
    """Single-parameter calibration: softmax(logits / T). T > 1 softens over-confident predictions."""
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=100)
    nll = nn.CrossEntropyLoss()

    def closure():
        opt.zero_grad()
        loss = nll(logits / log_t.exp(), labels)
        loss.backward()
        return loss

    opt.step(closure)
    return float(log_t.exp())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, help="Folder containing train.csv / val.csv (from prepare_data.py)")
    ap.add_argument("--out", default="../backend/weights/dermavision_effnet_b0.pt")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--warmup-epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--head-lr", type=float, default=1e-3)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--patience", type=int, default=6, help="stop if val macro-F1 does not improve for this many epochs")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--no-pretrained", action="store_true", help="skip ImageNet weights (offline smoke tests only)")
    ap.add_argument("--max-samples", type=int, default=0, help="use only N samples per split (smoke tests)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    print("device:", device)

    d = Path(args.data_dir)
    train_ds, val_ds = SkinDataset(d / "train.csv", train_transform), SkinDataset(d / "val.csv", eval_transform)
    if args.max_samples:
        train_ds = Subset(train_ds, range(args.max_samples))
        val_ds = Subset(val_ds, range(args.max_samples))
        train_targets = [train_ds.dataset.targets[i] for i in train_ds.indices]
    else:
        train_targets = train_ds.targets
    pin = device == "cuda"
    train_dl = DataLoader(train_ds, args.batch_size, shuffle=True, num_workers=args.workers, pin_memory=pin, drop_last=True)
    val_dl = DataLoader(val_ds, args.batch_size, shuffle=False, num_workers=args.workers, pin_memory=pin)

    # HAM10000 is ~67% nevus and ~1% dermatofibroma. Sqrt-inverse-frequency weights help rare classes
    # (melanoma especially) without the instability of full inverse-frequency weighting.
    counts = Counter(train_targets)
    w = torch.tensor([1.0 / np.sqrt(max(counts.get(i, 1), 1)) for i in range(len(CLASS_NAMES))], dtype=torch.float32)
    w = (w / w.mean()).to(device)
    criterion = nn.CrossEntropyLoss(weight=w, label_smoothing=0.1)
    print("class counts:", {CLASS_NAMES[i]: counts.get(i, 0) for i in range(len(CLASS_NAMES))})

    model = build_model(pretrained=not args.no_pretrained).to(device)
    amp = device == "cuda"
    scaler = torch.amp.GradScaler(enabled=amp)

    def make_opt(params, lr, epochs_left):
        opt = torch.optim.AdamW(params, lr=lr, weight_decay=1e-4)
        return opt, torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(epochs_left, 1))

    best, best_state, best_epoch = -1.0, None, 0
    for epoch in range(args.epochs):
        if epoch == 0 and args.warmup_epochs > 0:
            for p in model.features.parameters():
                p.requires_grad = False
            opt, sched = make_opt(model.classifier.parameters(), args.head_lr, args.warmup_epochs)
            print(f"-- phase 1: training head only for {args.warmup_epochs} epochs")
        if epoch == args.warmup_epochs:
            for p in model.parameters():
                p.requires_grad = True
            opt, sched = make_opt(model.parameters(), args.lr, args.epochs - epoch)
            print("-- phase 2: fine-tuning all layers")
        if epoch == 0 and args.warmup_epochs == 0:
            opt, sched = make_opt(model.parameters(), args.lr, args.epochs)

        model.train()
        total = 0.0
        for x, y in train_dl:
            x, y = x.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device, enabled=amp):
                loss = criterion(model(x), y)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            total += loss.item()
        sched.step()

        logits, labels = predict_logits(model, val_dl, device)
        m = metrics(logits, labels)
        print(f"epoch {epoch + 1:2d}/{args.epochs}  loss {total / max(len(train_dl), 1):.3f}  "
              + "  ".join(f"{k} {v:.3f}" for k, v in m.items()))
        if m["macro_f1"] > best:
            best, best_epoch, best_state, best_metrics = m["macro_f1"], epoch, copy.deepcopy(model.state_dict()), m
        elif epoch - best_epoch >= args.patience:
            print("early stopping")
            break

    model.load_state_dict(best_state)
    logits, labels = predict_logits(model, val_dl, device)
    temperature = fit_temperature(logits, labels)
    print(f"best epoch {best_epoch + 1}, val macro-F1 {best:.3f}, fitted temperature {temperature:.2f}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": {k: v.cpu() for k, v in best_state.items()},
            "class_names": CLASS_NAMES,
            "img_size": IMG_SIZE,
            "temperature": temperature,
            "val_metrics": best_metrics,
        },
        out,
    )
    print("saved", out.resolve())


if __name__ == "__main__":
    main()
