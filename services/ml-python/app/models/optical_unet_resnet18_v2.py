"""
ResNet-18 U-Net Architecture V2 for Domain-Adaptive Multi-Scale Optical Oil-Spill Segmentation
Part 0.14C.3 — Real Optical Oil-Spill Segmentation Model V2

Features:
1. ResNet-18 ImageNet-pretrained encoder.
2. Multi-Scale Context Bridge (Atrous Spatial Pyramid Pooling / Dilated Convolutions)
   to jointly capture narrow satellite ribbons (10m GSD) and broad drone slicks.
3. Boundary refinement decoder with multi-resolution feature fusion.
4. Deep supervision auxiliary logit head during training for strong gradient flow to early feature maps.
5. Inference probability mapping via sigmoid.
"""

from typing import Dict, Any, Tuple, Optional, Union
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


class ASPPBridge(nn.Module):
    """
    Atrous Spatial Pyramid Pooling Bridge for multi-scale receptive field capture.
    Allows concurrent representation of narrow 10m filaments and wide port slicks.
    """
    def __init__(self, in_channels: int = 512, out_channels: int = 512):
        super().__init__()
        inter_channels = out_channels // 4

        self.conv1x1 = nn.Sequential(
            nn.Conv2d(in_channels, inter_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(inter_channels),
            nn.ReLU(inplace=True)
        )
        self.conv3x3_d2 = nn.Sequential(
            nn.Conv2d(in_channels, inter_channels, kernel_size=3, padding=2, dilation=2, bias=False),
            nn.BatchNorm2d(inter_channels),
            nn.ReLU(inplace=True)
        )
        self.conv3x3_d4 = nn.Sequential(
            nn.Conv2d(in_channels, inter_channels, kernel_size=3, padding=4, dilation=4, bias=False),
            nn.BatchNorm2d(inter_channels),
            nn.ReLU(inplace=True)
        )
        self.global_pool = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Conv2d(in_channels, inter_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(inter_channels),
            nn.ReLU(inplace=True)
        )
        self.out_conv = nn.Sequential(
            nn.Conv2d(inter_channels * 4, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        size = x.shape[2:]
        f1 = self.conv1x1(x)
        f2 = self.conv3x3_d2(x)
        f3 = self.conv3x3_d4(x)
        f4 = F.interpolate(self.global_pool(x), size=size, mode="bilinear", align_corners=True)
        cat = torch.cat([f1, f2, f3, f4], dim=1)
        return self.out_conv(cat)


class DecoderBlock(nn.Module):
    """Upsampling decoder block with skip connection concatenation."""
    def __init__(self, in_channels: int, skip_channels: int, out_channels: int):
        super().__init__()
        self.conv = ConvBlock(in_channels + skip_channels, out_channels)

    def forward(self, x: torch.Tensor, skip: Optional[torch.Tensor] = None) -> torch.Tensor:
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=True)
        if skip is not None:
            if x.shape[2:] != skip.shape[2:]:
                x = F.interpolate(x, size=skip.shape[2:], mode="bilinear", align_corners=True)
            x = torch.cat([x, skip], dim=1)
        return self.conv(x)


class OpticalUNetResNet18V2(nn.Module):
    """
    Domain-Adaptive Multi-Scale Optical Oil Spill Segmentation Model (V2).
    """
    def __init__(self, pretrained: bool = True, num_classes: int = 1, use_deep_supervision: bool = True):
        super().__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        resnet = models.resnet18(weights=weights)
        self.use_deep_supervision = use_deep_supervision

        # Encoder backbone (ResNet-18)
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

        # Multi-scale Context Bridge
        self.bridge = ASPPBridge(in_channels=512, out_channels=512)

        # Decoder stages with multi-resolution skip connections
        self.dec4 = DecoderBlock(in_channels=512, skip_channels=256, out_channels=256) # H/16
        self.dec3 = DecoderBlock(in_channels=256, skip_channels=128, out_channels=128) # H/8
        self.dec2 = DecoderBlock(in_channels=128, skip_channels=64, out_channels=64)   # H/4
        self.dec1 = DecoderBlock(in_channels=64, skip_channels=64, out_channels=32)    # H/2

        # Final refinement head
        self.refinement = nn.Sequential(
            nn.Conv2d(32, 16, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True),
            nn.Conv2d(16, 16, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True)
        )
        self.final_head = nn.Conv2d(16, num_classes, kernel_size=1)

        # Deep supervision auxiliary head
        self.aux_head = nn.Conv2d(64, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor, return_aux: bool = False) -> Union[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        input_size = x.shape[2:]

        # Encoder forward pass
        s0 = self.stem(x)      # (B, 64, H/2, W/2)
        p0 = self.maxpool(s0)  # (B, 64, H/4, W/4)
        e1 = self.enc1(p0)     # (B, 64, H/4, W/4)
        e2 = self.enc2(e1)     # (B, 128, H/8, W/8)
        e3 = self.enc3(e2)     # (B, 256, H/16, W/16)
        e4 = self.enc4(e3)     # (B, 512, H/32, W/32)

        # Bridge forward pass
        b = self.bridge(e4)

        # Decoder forward pass
        d4 = self.dec4(b, e3)
        d3 = self.dec3(d4, e2)
        d2 = self.dec2(d3, e1)
        d1 = self.dec1(d2, s0)

        # Final head
        d0 = F.interpolate(d1, size=input_size, mode="bilinear", align_corners=True)
        d0 = self.refinement(d0)
        main_logits = self.final_head(d0)

        if return_aux and self.use_deep_supervision and self.training:
            aux_logits = F.interpolate(self.aux_head(d2), size=input_size, mode="bilinear", align_corners=True)
            return main_logits, aux_logits

        return main_logits

    def predict_probability(self, x: torch.Tensor) -> torch.Tensor:
        """Returns pixel sigmoid probability map in [0.0, 1.0]."""
        logits = self.forward(x, return_aux=False)
        return torch.sigmoid(logits)


def create_optical_unet_resnet18_v2(pretrained: bool = True, num_classes: int = 1) -> OpticalUNetResNet18V2:
    """Factory function for OpticalUNetResNet18V2."""
    return OpticalUNetResNet18V2(pretrained=pretrained, num_classes=num_classes)
