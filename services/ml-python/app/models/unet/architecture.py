import torch
import torch.nn as nn

class UNet(nn.Module):
    def __init__(self, in_channels=1, num_classes=1):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(in_channels, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True)
        )
        self.head = nn.Conv2d(64, num_classes, kernel_size=1)

    def forward(self, x):
        return torch.sigmoid(self.head(self.encoder(x)))
