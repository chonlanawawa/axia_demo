"""
Segmentation model — exact architecture from stage1segfinal.ipynb / stage2segfinal.ipynb.

UNetResNet50(in_channels=3)
  Encoder:  ResNet50 (conv1, bn1, layer1-4)
  Bottleneck: center ConvBNReLU(2048→512)
  Decoder:  up4(512,1024→256) → up3(256,512→128) → up2(128,256→64) → up1(64,64→32)
  Head:     stem_refine(32→32) → seg_head(32→1) → ×2 bilinear

Input:  (B, 3, 256, 256)  — 2.5D stacked grayscale (z-1, z, z+1) / 255
Output: (B, 1, 256, 256)  — raw logit mask (apply sigmoid + threshold)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as tv_models


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def adapt_first_conv(conv: nn.Conv2d, in_channels: int) -> nn.Conv2d:
    if in_channels == conv.in_channels:
        return conv
    new_conv = nn.Conv2d(
        in_channels, conv.out_channels,
        kernel_size=conv.kernel_size, stride=conv.stride,
        padding=conv.padding, bias=(conv.bias is not None),
    )
    with torch.no_grad():
        if in_channels == 1:
            new_conv.weight.copy_(conv.weight.mean(dim=1, keepdim=True))
        elif in_channels > 3:
            new_conv.weight[:, :3].copy_(conv.weight)
            mean_ch = conv.weight.mean(dim=1, keepdim=True)
            for c in range(3, in_channels):
                new_conv.weight[:, c:c + 1].copy_(mean_ch)
        else:
            new_conv.weight[:, :in_channels].copy_(conv.weight[:, :in_channels])
        if conv.bias is not None and new_conv.bias is not None:
            new_conv.bias.copy_(conv.bias)
    return new_conv


def build_resnet50_encoder(in_channels: int = 3, use_imagenet: bool = True):
    weights = tv_models.ResNet50_Weights.IMAGENET1K_V2 if use_imagenet else None
    backbone = tv_models.resnet50(weights=weights)
    if in_channels != 3:
        backbone.conv1 = adapt_first_conv(backbone.conv1, in_channels)
    return backbone


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

class ConvBNReLU(nn.Module):
    """Double Conv-BN-ReLU block.
    Stage 1 (hemorrhage): dropout=0.0  — no Dropout layers
    Stage 2 (ischemic):   dropout=0.15 — Dropout2d after each ReLU
    """
    def __init__(self, in_ch: int, out_ch: int, dropout: float = 0.0):
        super().__init__()
        layers = [
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        ]
        if dropout > 0:
            layers.append(nn.Dropout2d(dropout))
        layers += [
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        ]
        if dropout > 0:
            layers.append(nn.Dropout2d(dropout))
        self.block = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class UpBlock(nn.Module):
    """Upsample → concat skip → ConvBNReLU."""

    def __init__(self, in_ch: int, skip_ch: int, out_ch: int, dropout: float = 0.0):
        super().__init__()
        self.conv = ConvBNReLU(in_ch + skip_ch, out_ch, dropout=dropout)

    def forward(self, x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        x = torch.cat([x, skip], dim=1)
        return self.conv(x)


# ---------------------------------------------------------------------------
# Main model
# ---------------------------------------------------------------------------

class UNetResNet50(nn.Module):
    """
    ResNet-50 encoder + U-Net decoder.
    Channel flow:
        conv1/bn1/maxpool → x0 (64ch, H/2)
        layer1 → x1 (256ch, H/4)
        layer2 → x2 (512ch, H/8)
        layer3 → x3 (1024ch, H/16)
        layer4 → x4 (2048ch, H/32)
        center  → 512ch
        up4(x3) → 256ch   (skip: 1024)
        up3(x2) → 128ch   (skip:  512)
        up2(x1) → 64ch    (skip:  256)
        up1(x0) → 32ch    (skip:   64)
        stem_refine → 32ch
        seg_head → 1ch, ×2 → original size
    """

    def __init__(self, in_channels: int = 3, use_imagenet: bool = True, dropout: float = 0.0):
        super().__init__()
        backbone = build_resnet50_encoder(in_channels=in_channels, use_imagenet=use_imagenet)

        self.conv1   = backbone.conv1
        self.bn1     = backbone.bn1
        self.relu    = backbone.relu
        self.maxpool = backbone.maxpool

        self.layer1 = backbone.layer1   # 256ch, /4
        self.layer2 = backbone.layer2   # 512ch, /8
        self.layer3 = backbone.layer3   # 1024ch, /16
        self.layer4 = backbone.layer4   # 2048ch, /32

        self.center = ConvBNReLU(2048, 512, dropout=dropout)

        self.up4 = UpBlock(512,  1024, 256, dropout=dropout)
        self.up3 = UpBlock(256,   512, 128, dropout=dropout)
        self.up2 = UpBlock(128,   256,  64, dropout=dropout)
        self.up1 = UpBlock( 64,    64,  32, dropout=dropout)

        self.stem_refine = ConvBNReLU(32, 32, dropout=dropout)
        self.seg_head    = nn.Conv2d(32, 1, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x0 = self.relu(self.bn1(self.conv1(x)))   # H/2,  64ch
        x1 = self.layer1(self.maxpool(x0))         # H/4,  256ch
        x2 = self.layer2(x1)                       # H/8,  512ch
        x3 = self.layer3(x2)                       # H/16, 1024ch
        x4 = self.layer4(x3)                       # H/32, 2048ch

        d  = self.center(x4)
        d  = self.up4(d, x3)
        d  = self.up3(d, x2)
        d  = self.up2(d, x1)
        d  = self.up1(d, x0)

        d  = self.stem_refine(d)
        d  = self.seg_head(d)
        d  = F.interpolate(d, scale_factor=2, mode="bilinear", align_corners=False)
        d  = torch.nan_to_num(d, nan=0.0, posinf=20.0, neginf=-20.0)
        return d
