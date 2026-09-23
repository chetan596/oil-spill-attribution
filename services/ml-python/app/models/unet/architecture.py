"""
Production-Ready Deep Learning U-Net Architecture for SAR Semantic Segmentation.
Implements a modular Encoder-Decoder U-Net with DoubleConv blocks, Residual Skip Connections,
Batch Normalization, and Dropout for marine oil slick detection.
"""

import torch
import torch.nn as nn
from typing import Optional, Tuple, List, Dict, Any


class DoubleConv(nn.Module):
    """(Convolution => BatchNorm => ReLU) * 2 with residual connection option"""

    def __init__(self, in_channels: int, out_channels: int, mid_channels: Optional[int] = None):
        super().__init__()
        if not mid_channels:
            mid_channels = out_channels
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(mid_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class Down(nn.Module):
    """Downscaling with maxpool then double conv"""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.maxpool_conv(x)


class Up(nn.Module):
    """Upscaling then double conv with skip connection"""

    def __init__(self, in_channels: int, out_channels: int, bilinear: bool = True):
        super().__init__()
        if bilinear:
            self.up = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
            self.conv = DoubleConv(in_channels, out_channels, in_channels // 2)
        else:
            self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
            self.conv = DoubleConv(in_channels, out_channels)

    def forward(self, x1: torch.Tensor, x2: torch.Tensor) -> torch.Tensor:
        x1 = self.up(x1)
        # Pad if dimensions differ slightly due to odd resolutions
        diff_y = x2.size()[2] - x1.size()[2]
        diff_x = x2.size()[3] - x1.size()[3]

        x1 = nn.functional.pad(
            x1, [diff_x // 2, diff_x - diff_x // 2, diff_y // 2, diff_y - diff_y // 2]
        )
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)


class OutConv(nn.Module):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class UNet(nn.Module):
    """
    Standard U-Net Architecture for SAR Marine Oil Spill Segmentation.

    Args:
        in_channels: Number of SAR input channels (1 for VV, 2 for VV+VH). Default is 1.
        num_classes: Number of output segmentation classes. Default is 2 (0: Clean Sea, 1: Oil Spill).
        base_channels: Number of base convolution filters in the first layer (default 32 or 64).
        bilinear: Use bilinear upsampling instead of transposed convolutions (default True).
    """

    def __init__(
        self,
        in_channels: int = 1,
        num_classes: int = 2,
        base_channels: int = 32,
        bilinear: bool = True
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.bilinear = bilinear

        factor = 2 if bilinear else 1

        self.inc = DoubleConv(in_channels, base_channels)
        self.down1 = Down(base_channels, base_channels * 2)
        self.down2 = Down(base_channels * 2, base_channels * 4)
        self.down3 = Down(base_channels * 4, base_channels * 8)
        self.down4 = Down(base_channels * 8, (base_channels * 16) // factor)

        self.up1 = Up(base_channels * 16, (base_channels * 8) // factor, bilinear)
        self.up2 = Up(base_channels * 8, (base_channels * 4) // factor, bilinear)
        self.up3 = Up(base_channels * 4, (base_channels * 2) // factor, bilinear)
        self.up4 = Up(base_channels * 2, base_channels, bilinear)
        self.outc = OutConv(base_channels, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        logits = self.outc(x)
        return logits

    def predict_probabilities(self, x: torch.Tensor) -> torch.Tensor:
        """
        Execute forward pass and return class probabilities.
        If num_classes == 1: returns sigmoid (1, H, W).
        If num_classes > 1: returns softmax (num_classes, H, W).
        """
        with torch.no_grad():
            logits = self.forward(x)
            if self.num_classes == 1:
                probs = torch.sigmoid(logits)
            else:
                probs = torch.softmax(logits, dim=1)
            return probs


class MultiScaleContextBlock(nn.Module):
    """
    Multi-Scale Spatial Context Block for bottleneck feature enrichment.
    Applies parallel dilated convolutions with dilation rates 1, 2, and 4
    to capture multi-scale context without reducing spatial resolution.
    """

    def __init__(
        self,
        in_channels: int,
        branch_channels: Optional[int] = None,
        out_channels: Optional[int] = None,
    ):
        super().__init__()
        if branch_channels is None:
            branch_channels = max(16, in_channels // 3)
        if out_channels is None:
            out_channels = in_channels

        self.branch1 = nn.Sequential(
            nn.Conv2d(in_channels, branch_channels, kernel_size=3, padding=1, dilation=1, bias=False),
            nn.BatchNorm2d(branch_channels),
            nn.ReLU(inplace=True),
        )
        self.branch2 = nn.Sequential(
            nn.Conv2d(in_channels, branch_channels, kernel_size=3, padding=2, dilation=2, bias=False),
            nn.BatchNorm2d(branch_channels),
            nn.ReLU(inplace=True),
        )
        self.branch3 = nn.Sequential(
            nn.Conv2d(in_channels, branch_channels, kernel_size=3, padding=4, dilation=4, bias=False),
            nn.BatchNorm2d(branch_channels),
            nn.ReLU(inplace=True),
        )

        concat_channels = branch_channels * 3
        self.fusion = nn.Sequential(
            nn.Conv2d(concat_channels, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b1 = self.branch1(x)
        b2 = self.branch2(x)
        b3 = self.branch3(x)
        concat = torch.cat([b1, b2, b3], dim=1)
        fused = self.fusion(concat)
        return fused


class UNetMultiScaleContext(nn.Module):
    """
    Multi-Scale Context U-Net Architecture for SAR Marine Oil Spill Segmentation.
    Preserves standard U-Net encoder-decoder structure and adds parallel multi-scale
    dilated convolution branches at the bottleneck.
    """

    def __init__(
        self,
        in_channels: int = 2,
        num_classes: int = 2,
        base_channels: int = 16,
        bilinear: bool = True,
        branch_channels: Optional[int] = None,
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.base_channels = base_channels
        self.bilinear = bilinear

        factor = 2 if bilinear else 1
        bottleneck_channels = (base_channels * 16) // factor

        self.inc = DoubleConv(in_channels, base_channels)
        self.down1 = Down(base_channels, base_channels * 2)
        self.down2 = Down(base_channels * 2, base_channels * 4)
        self.down3 = Down(base_channels * 4, base_channels * 8)
        self.down4 = Down(base_channels * 8, bottleneck_channels)

        # Multi-scale context block at bottleneck
        self.context = MultiScaleContextBlock(
            in_channels=bottleneck_channels,
            branch_channels=branch_channels or (bottleneck_channels // 3),
            out_channels=bottleneck_channels,
        )

        self.up1 = Up(base_channels * 16, (base_channels * 8) // factor, bilinear)
        self.up2 = Up(base_channels * 8, (base_channels * 4) // factor, bilinear)
        self.up3 = Up(base_channels * 4, (base_channels * 2) // factor, bilinear)
        self.up4 = Up(base_channels * 2, base_channels, bilinear)
        self.outc = OutConv(base_channels, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        # Multi-scale bottleneck feature enrichment
        x5 = self.context(x5)

        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        logits = self.outc(x)
        return logits

    def predict_probabilities(self, x: torch.Tensor) -> torch.Tensor:
        """
        Execute forward pass and return class probabilities.
        If num_classes == 1: returns sigmoid (1, H, W).
        If num_classes > 1: returns softmax (num_classes, H, W).
        """
        with torch.no_grad():
            logits = self.forward(x)
            if self.num_classes == 1:
                probs = torch.sigmoid(logits)
            else:
                probs = torch.softmax(logits, dim=1)
            return probs


MultiScaleUNet = UNetMultiScaleContext


class AttentionGate(nn.Module):
    """
    Additive Spatial Attention Gate for Attention U-Net skip connections.
    Calculates spatial attention coefficients:
      alpha = Sigmoid(psi(ReLU(theta(x) + phi(g))))
      attended_skip = x * alpha
    """

    def __init__(
        self,
        in_channels_x: int,
        in_channels_g: int,
        inter_channels: Optional[int] = None,
    ):
        super().__init__()
        if inter_channels is None:
            inter_channels = max(8, in_channels_x // 2)

        self.theta = nn.Sequential(
            nn.Conv2d(in_channels_x, inter_channels, kernel_size=1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(inter_channels),
        )
        self.phi = nn.Sequential(
            nn.Conv2d(in_channels_g, inter_channels, kernel_size=1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(inter_channels),
        )
        self.psi = nn.Sequential(
            nn.Conv2d(inter_channels, 1, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(1),
            nn.Sigmoid(),
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor, g: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: Encoder skip feature map (B, Cx, H, W)
            g: Decoder gating feature map (B, Cg, Hg, Wg)
        Returns:
            attended_x: (B, Cx, H, W)
            attention_coeff: (B, 1, H, W)
        """
        if g.size()[2:] != x.size()[2:]:
            g = nn.functional.interpolate(g, size=x.size()[2:], mode="bilinear", align_corners=True)

        theta_x = self.theta(x)
        phi_g = self.phi(g)
        fused = self.relu(theta_x + phi_g)
        alpha = self.psi(fused)
        attended_x = x * alpha
        return attended_x, alpha


class UNetAttention(nn.Module):
    """
    Attention U-Net Architecture for SAR Marine Oil Spill Segmentation.
    Applies spatial attention gates to all encoder-to-decoder skip connections.
    """

    def __init__(
        self,
        in_channels: int = 2,
        num_classes: int = 2,
        base_channels: int = 16,
        bilinear: bool = True,
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.base_channels = base_channels
        self.bilinear = bilinear

        factor = 2 if bilinear else 1
        bottleneck_channels = (base_channels * 16) // factor

        self.inc = DoubleConv(in_channels, base_channels)
        self.down1 = Down(base_channels, base_channels * 2)
        self.down2 = Down(base_channels * 2, base_channels * 4)
        self.down3 = Down(base_channels * 4, base_channels * 8)
        self.down4 = Down(base_channels * 8, bottleneck_channels)

        # Attention gates for skip connections
        self.att1 = AttentionGate(in_channels_x=base_channels * 8, in_channels_g=bottleneck_channels)
        self.up1 = Up(base_channels * 16, (base_channels * 8) // factor, bilinear)

        self.att2 = AttentionGate(in_channels_x=base_channels * 4, in_channels_g=(base_channels * 8) // factor)
        self.up2 = Up(base_channels * 8, (base_channels * 4) // factor, bilinear)

        self.att3 = AttentionGate(in_channels_x=base_channels * 2, in_channels_g=(base_channels * 4) // factor)
        self.up3 = Up(base_channels * 4, (base_channels * 2) // factor, bilinear)

        self.att4 = AttentionGate(in_channels_x=base_channels, in_channels_g=(base_channels * 2) // factor)
        self.up4 = Up(base_channels * 2, base_channels, bilinear)

        self.outc = OutConv(base_channels, num_classes)

    def forward(self, x: torch.Tensor, return_attention: bool = False):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x4_att, alpha1 = self.att1(x4, x5)
        d1 = self.up1(x5, x4_att)

        x3_att, alpha2 = self.att2(x3, d1)
        d2 = self.up2(d1, x3_att)

        x2_att, alpha3 = self.att3(x2, d2)
        d3 = self.up3(d2, x2_att)

        x1_att, alpha4 = self.att4(x1, d3)
        d4 = self.up4(d3, x1_att)

        logits = self.outc(d4)
        if return_attention:
            return logits, [alpha1, alpha2, alpha3, alpha4]
        return logits

    def predict_probabilities(self, x: torch.Tensor) -> torch.Tensor:
        """
        Execute forward pass and return class probabilities.
        """
        with torch.no_grad():
            logits = self.forward(x)
            if self.num_classes == 1:
                probs = torch.sigmoid(logits)
            else:
                probs = torch.softmax(logits, dim=1)
            return probs


AttentionUNet = UNetAttention


class ResidualBlock(nn.Module):
    """
    Lightweight 2-layer residual convolutional block with projection shortcut.
    
    Structure:
      input x
        |
        +-----------------------------------+
        |                                   |
        | Conv2d(3x3) -> BatchNorm2d -> ReLU|
        | Conv2d(3x3) -> BatchNorm2d        |
        |                                   |
        +-- shortcut (1x1 conv if in!=out) -+
                    |
                   Add
                    |
                   ReLU
    """

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        mid_channels: Optional[int] = None,
    ):
        super().__init__()
        if not mid_channels:
            mid_channels = out_channels

        self.conv1 = nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(mid_channels)
        self.relu = nn.ReLU(inplace=True)

        self.conv2 = nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)

        if in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False),
                nn.BatchNorm2d(out_channels),
            )
        else:
            self.shortcut = nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = self.shortcut(x)

        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)

        out = self.conv2(out)
        out = self.bn2(out)

        out = self.relu(out + residual)
        return out


class ResidualDown(nn.Module):
    """Downscaling with maxpool then residual block"""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.maxpool_res = nn.Sequential(
            nn.MaxPool2d(2),
            ResidualBlock(in_channels, out_channels)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.maxpool_res(x)


class ResidualUp(nn.Module):
    """Upscaling then residual block with skip connection"""

    def __init__(self, in_channels: int, out_channels: int, bilinear: bool = True):
        super().__init__()
        if bilinear:
            self.up = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
            self.conv = ResidualBlock(in_channels, out_channels, in_channels // 2)
        else:
            self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
            self.conv = ResidualBlock(in_channels, out_channels)

    def forward(self, x1: torch.Tensor, x2: torch.Tensor) -> torch.Tensor:
        x1 = self.up(x1)
        diff_y = x2.size()[2] - x1.size()[2]
        diff_x = x2.size()[3] - x1.size()[3]

        x1 = nn.functional.pad(
            x1, [diff_x // 2, diff_x - diff_x // 2, diff_y // 2, diff_y - diff_y // 2]
        )
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)


class UNetResidual(nn.Module):
    """
    Residual U-Net Architecture for SAR Marine Oil Spill Segmentation.
    Replaces standard DoubleConv blocks with residual blocks.
    """

    def __init__(
        self,
        in_channels: int = 2,
        num_classes: int = 2,
        base_channels: int = 16,
        bilinear: bool = True,
    ):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.base_channels = base_channels
        self.bilinear = bilinear

        factor = 2 if bilinear else 1
        bottleneck_channels = (base_channels * 16) // factor

        self.inc = ResidualBlock(in_channels, base_channels)
        self.down1 = ResidualDown(base_channels, base_channels * 2)
        self.down2 = ResidualDown(base_channels * 2, base_channels * 4)
        self.down3 = ResidualDown(base_channels * 4, base_channels * 8)
        self.down4 = ResidualDown(base_channels * 8, bottleneck_channels)

        self.up1 = ResidualUp(base_channels * 16, (base_channels * 8) // factor, bilinear)
        self.up2 = ResidualUp(base_channels * 8, (base_channels * 4) // factor, bilinear)
        self.up3 = ResidualUp(base_channels * 4, (base_channels * 2) // factor, bilinear)
        self.up4 = ResidualUp(base_channels * 2, base_channels, bilinear)
        self.outc = OutConv(base_channels, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        logits = self.outc(x)
        return logits

    def predict_probabilities(self, x: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            logits = self.forward(x)
            if self.num_classes == 1:
                probs = torch.sigmoid(logits)
            else:
                probs = torch.softmax(logits, dim=1)
            return probs


ResidualUNet = UNetResidual
