import torch
import torch.nn as nn

class SuperResolutionNet(nn.Module):
    def __init__(self, scale_factor=2):
        super().__init__()
        self.conv = nn.Conv2d(1, 64, kernel_size=5, padding=2)
        self.upsample = nn.Upsample(scale_factor=scale_factor, mode='bilinear', align_corners=False)
        self.out = nn.Conv2d(64, 1, kernel_size=3, padding=1)

    def forward(self, x):
        return self.out(self.upsample(torch.relu(self.conv(x))))
