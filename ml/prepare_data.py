"""Build train/val/test CSVs from HAM10000, splitting BY LESION so the same lesion never appears in two splits.

HAM10000 has ~10,015 images but only ~7,470 unique lesions: many lesions were photographed several times.
A naive random split leaks near-duplicate images into the test set and inflates accuracy.

Usage:  python prepare_data.py --data-dir data/HAM10000
"""
import argparse
from pathlib import Path

import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, help="Folder with HAM10000_metadata.csv and the image folders")
    ap.add_argument("--out-dir", default=None, help="Where to write the split CSVs (default: <data-dir>/splits)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    root = Path(args.data_dir)
    meta = pd.read_csv(next(root.rglob("HAM10000_metadata.csv")))
    paths = {p.stem: str(p.resolve()) for p in root.rglob("*.jpg")}
    meta["image_path"] = meta["image_id"].map(paths)
    missing = meta["image_path"].isna().sum()
    if missing:
        raise SystemExit(f"{missing} images listed in the metadata were not found under {root}")

    # 10 folds grouped by lesion: fold 0 = test (~10%), fold 1 = validation (~10%), rest = train (~80%).
    folds = StratifiedGroupKFold(n_splits=10, shuffle=True, random_state=args.seed)
    meta["fold"] = -1
    for k, (_, idx) in enumerate(folds.split(meta, meta["dx"], groups=meta["lesion_id"])):
        meta.loc[meta.index[idx], "fold"] = k

    splits = {"test": meta[meta.fold == 0], "val": meta[meta.fold == 1], "train": meta[meta.fold >= 2]}
    ids = {k: set(v["lesion_id"]) for k, v in splits.items()}
    assert not (ids["train"] & ids["val"] or ids["train"] & ids["test"] or ids["val"] & ids["test"]), "lesion leakage!"

    out = Path(args.out_dir) if args.out_dir else root / "splits"
    out.mkdir(parents=True, exist_ok=True)
    cols = ["image_path", "dx", "lesion_id"]
    for name, df in splits.items():
        df[cols].to_csv(out / f"{name}.csv", index=False)
        print(f"{name:5s} {len(df):5d} images, {df.lesion_id.nunique():5d} lesions  ", df.dx.value_counts().to_dict())
    print(f"Wrote splits to {out}")


if __name__ == "__main__":
    main()
