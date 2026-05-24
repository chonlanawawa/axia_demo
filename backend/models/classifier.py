"""
Classification models — exact architecture from stage1-2bloodclotver2.ipynb.

StudyTransformer(emb_dim=512, n_heads=8, n_layers=2)
  └─ SliceEncoder: tf_efficientnetv2_s → Linear(in_dim, 512)
  └─ cls_token + TransformerEncoder(2 layers, 8 heads, gelu)
  └─ head: LayerNorm + Linear(512, 1)

Input shape: (B, N, 3, 256, 256)  — N slices per study (padded/sampled to 32)
Output:      (B, 1)               — raw logit, apply sigmoid for probability
"""

import torch
import torch.nn as nn
import timm


class SliceEncoder(nn.Module):
    def __init__(self, backbone: str = "tf_efficientnetv2_s", pretrained: bool = False, out_dim: int = 512):
        super().__init__()
        self.backbone = timm.create_model(backbone, pretrained=pretrained, num_classes=0, global_pool="avg")
        in_dim = self.backbone.num_features
        self.proj = nn.Linear(in_dim, out_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.backbone(x)
        return self.proj(feat)


class StudyTransformer(nn.Module):
    def __init__(
        self,
        backbone: str = "tf_efficientnetv2_s",
        pretrained: bool = False,
        emb_dim: int = 512,
        n_heads: int = 8,
        n_layers: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.encoder = SliceEncoder(backbone, pretrained, out_dim=emb_dim)
        self.cls_token = nn.Parameter(torch.zeros(1, 1, emb_dim))

        layer = nn.TransformerEncoderLayer(
            d_model=emb_dim,
            nhead=n_heads,
            dim_feedforward=emb_dim * 4,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.transformer = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.head = nn.Sequential(nn.LayerNorm(emb_dim), nn.Linear(emb_dim, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, N, C, H, W)
        B, N, C, H, W = x.shape
        feat = self.encoder(x.view(B * N, C, H, W)).view(B, N, -1)
        cls = self.cls_token.expand(B, 1, feat.size(-1))
        tok = torch.cat([cls, feat], dim=1)          # (B, N+1, emb_dim)
        tok = self.transformer(tok)
        return self.head(tok[:, 0])                  # (B, 1)
