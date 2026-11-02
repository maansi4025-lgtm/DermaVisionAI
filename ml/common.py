"""Shared pieces for training/evaluation. The backend (backend/app/services/classifier.py) must preprocess
images exactly like `eval_transform` below, or accuracy will silently drop."""
import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms as T
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

# HAM10000 diagnosis codes, alphabetical. The checkpoint stores this list so the backend never has to guess.
CLASS_NAMES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]
IMG_SIZE = 224
MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]


def build_model(num_classes: int = len(CLASS_NAMES), pretrained: bool = True) -> torch.nn.Module:
    weights = EfficientNet_B0_Weights.DEFAULT if pretrained else None
    model = efficientnet_b0(weights=weights)
    model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
    return model


# Whole image is squashed to a square first (same as the backend), then augmented.
eval_transform = T.Compose([T.Resize((IMG_SIZE, IMG_SIZE)), T.ToTensor(), T.Normalize(MEAN, STD)])
train_transform = T.Compose(
    [
        T.Resize((IMG_SIZE, IMG_SIZE)),
        T.RandomResizedCrop(IMG_SIZE, scale=(0.75, 1.0), ratio=(0.9, 1.1)),
        T.RandomHorizontalFlip(),
        T.RandomVerticalFlip(),  # lesions have no "up", so flips and full rotations are safe
        T.RandomRotation(180),
        T.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.02),
        T.ToTensor(),
        T.Normalize(MEAN, STD),
    ]
)


class SkinDataset(Dataset):
    def __init__(self, csv_path, transform):
        self.df = pd.read_csv(csv_path)
        self.transform = transform
        self.targets = [CLASS_NAMES.index(d) for d in self.df["dx"]]

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        img = Image.open(self.df.iloc[i]["image_path"]).convert("RGB")
        return self.transform(img), self.targets[i]
