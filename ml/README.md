# Training the DermaVision model

Goal: fine-tune **EfficientNet-B0** (pretrained on ImageNet) to classify the 7 HAM10000 categories, then drop the
resulting `.pt` file into `backend/weights/` — the API picks it up automatically.

```
HAM10000 images ──prepare_data.py──▶ train/val/test CSVs ──train.py──▶ dermavision_effnet_b0.pt ──▶ backend
                                                         └─evaluate.py─▶ per-class report + confusion matrix
```

## 0. Hardware

Training on a CPU takes many hours. Use a GPU: **Google Colab** (Runtime → Change runtime type → T4 GPU) is free and
finishes 25 epochs in roughly 30–60 minutes. On a laptop, add `--workers 0` if you hit multiprocessing errors.

## 1. Get the dataset

HAM10000 (10,015 dermoscopic images, 7 classes) — licence **CC BY-NC 4.0** (non-commercial; cite Tschandl et al., 2018).

- Kaggle: `kaggle datasets download -d kmader/skin-cancer-mnist-ham10000` (needs a free Kaggle API token), or
- Harvard Dataverse: search "HAM10000" (doi:10.7910/DVN/DBW86T).

Unzip into `ml/data/HAM10000/` so it contains `HAM10000_metadata.csv` and the image folders
(`HAM10000_images_part_1`, `HAM10000_images_part_2`).

## 2. Install and split

```bash
cd ml
pip install -r requirements.txt
python prepare_data.py --data-dir data/HAM10000
```

This splits **by lesion**, not by image. HAM10000 contains several photos of the same lesion; a random split puts
near-duplicates in train and test and gives fake, inflated accuracy.

## 3. Train

```bash
python train.py --data-dir data/HAM10000/splits
```

What it does: 3 warm-up epochs training only the new head, then fine-tunes all layers with cosine LR decay;
class-weighted loss (HAM10000 is ~67% nevus) with label smoothing; flip/rotation/colour augmentation; keeps the
checkpoint with the best validation macro-F1; early-stops after 6 epochs without improvement; finally fits a
**temperature** on the validation set so the confidence percentage shown to users is calibrated.

Useful flags: `--epochs 40`, `--batch-size 64` (if GPU memory allows), `--lr 1e-4`, `--out path.pt`.

## 4. Evaluate on the untouched test split

```bash
python evaluate.py --data-dir data/HAM10000/splits
```

Read **per-class recall**, especially `mel` (melanoma sensitivity). Overall accuracy is misleading here: always
predicting "nevus" scores ~67%. Also check the expected calibration error (lower is better).

## 5. Use it in the app

The script saves to `backend/weights/dermavision_effnet_b0.pt`. Restart the API; `GET /api/health` should now show
`"model": "trained"`. Set `DEMO_MODE=false` in `backend/.env`.

On Colab, download the file from the Files panel and place it in `backend/weights/`.

## Improving results

1. Try `efficientnet_b2/b3` at 260–300 px (change `common.py`; the checkpoint stores `img_size`).
2. Train longer / lower LR; try a 5-fold ensemble (average the probabilities).
3. Add ISIC 2019/2020 data (watch the licences).
4. Tune the risk thresholds in `backend/app/services/lesion_info.py` on your validation set.

## Limits you must be honest about

- **Domain gap:** HAM10000 is dermoscope images. Users will upload *phone photos*, which look different; expect
  noticeably worse performance than the test-set numbers. Evaluate on phone photos before making any claims.
- **Skin-tone bias:** the data is mostly lighter skin (Austria/Australia). Performance on darker skin is not validated.
- **Label noise / class imbalance:** some classes have only ~100 examples, so per-class numbers are noisy.
- This is a screening aid, not a medical device. Keep the disclaimers in the UI.
