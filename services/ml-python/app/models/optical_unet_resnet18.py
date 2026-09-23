"""
ResNet-18 U-Net Architecture for Optical Oil-Spill Segmentation
Part 0.14C.2 — Real Optical Oil-Spill Segmentation Model

Combines ImageNet-pretrained ResNet-18 encoder with a feature-fused decoder
for high-resolution pixel-level oil slick boundary delineation.
"""

from typing import Dict, Any, Tuple, Optional
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models


class ConvBlock(nn.Module):
    """Two consecutive conv layers with BatchNorm and ReLU."""
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class DecoderBlock(nn.Module):
    """Upsampling decoder block with skip connection concatenation."""
    def __init__(self, in_channels: int, skip_channels: int, out_channels: int):
        super().__init__()
        self.conv = ConvBlock(in_channels + skip_channels, out_channels)

    def forward(self, x: torch.Tensor, skip: Optional[torch.Tensor] = None) -> torch.Tensor:
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=True)
        if skip is not None:
            # Handle minor shape differences if input is not power of 2
            if x.shape[2:] != skip.shape[2:]:
                x = F.interpolate(x, size=skip.shape[2:], mode="bilinear", align_corners=True)
            x = torch.cat([x, skip], dim=1)
        return self.conv(x)


class OpticalUNetResNet18(nn.Module):
    """
    U-Net segmentation model with ImageNet-pretrained ResNet-18 backbone encoder.
    Outputs single-channel binary oil spill logit map.
    """
    def __init__(self, pretrained: bool = True, num_classes: int = 1):
        super().__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        resnet = models.resnet18(weights=weights)

        # Encoder layers
        self.stem = nn.Sequential(
            resnet.conv1,
            resnet.bn1,
            resnet.relu
        )  # (B, 64, H/2, W/2)
        self.maxpool = resnet.maxpool  # (B, 64, H/4, W/4)
        self.enc1 = resnet.layer1     # (B, 64, H/4, W/4)
        self.enc2 = resnet.layer2     # (B, 128, H/8, W/8)
        self.enc3 = resnet.layer3     # (B, 256, H/16, W/16)
        self.enc4 = resnet.layer4     # (B, 512, H/32, W/32)

        # Bridge
        self.bridge = ConvBlock(512, 512)

        # Decoder layers with skip connections
        self.dec4 = DecoderBlock(in_channels=512, skip_channels=256, out_channels=256) # H/16
        self.dec3 = DecoderBlock(in_channels=256, skip_channels=128, out_channels=128) # H/8
        self.dec2 = DecoderBlock(in_channels=128, skip_channels=64, out_channels=64)   # H/4
        self.dec1 = DecoderBlock(in_channels=64, skip_channels=64, out_channels=32)    # H/2
        self.dec0 = nn.Sequential(
            nn.Conv2d(32, 16, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True)
        )

        self.final_head = nn.Conv2d(16, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        input_size = x.shape[2:]

        # Encoder forward pass
        s0 = self.stem(x)      # (B, 64, H/2, W/2)
        p0 = self.maxpool(s0)  # (B, 64, H/4, W/4)
        e1 = self.enc1(p0)     # (B, 64, H/4, W/4)
        e2 = self.enc2(e1)     # (B, 128, H/8, W/8)
        e3 = self.enc3(e2)     # (B, 256, H/16, W/16)
        e4 = self.enc4(e3)     # (B, 512, H/32, W/32)

        # Bridge
        b = self.bridge(e4)

        # Decoder forward pass
        d4 = self.dec4(b, e3)
        d3 = self.dec3(d4, e2)
        d2 = self.dec2(d3, e1)
        d1 = self.dec1(d2, s0)

        d0 = F.interpolate(d1, size=input_size, mode="bilinear", align_corners=True)
        d0 = self.dec0(d0)
        logits = self.final_head(d0)
        return logits

    def predict_probability(self, x: torch.Tensor) -> torch.Tensor:
        """Returns sigmoid probability map in [0.0, 1.0]."""
        logits = self.forward(x)
        return torch.sigmoid(logits)


def create_optical_unet_resnet18(pretrained: bool = True, num_classes: int = 1) -> OpticalUNetResNet18:
    """Factory function for OpticalUNetResNet18."""
    return OpticalUNetResNet18(pretrained=pretrained, num_classes=num_classes)

