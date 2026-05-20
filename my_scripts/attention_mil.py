import torch
import torch.nn as nn
import torch.nn.functional as F


class AttentionMIL(nn.Module):
    def __init__(self, input_dim: int = 1024, hidden_dim: int = 256, attention_dim: int = 128, n_classes: int = 2):
        super().__init__()
        self.feature_extractor = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
        )
        self.attention = nn.Sequential(
            nn.Linear(hidden_dim, attention_dim),
            nn.Tanh(),
            nn.Linear(attention_dim, 1),
        )
        self.classifier = nn.Linear(hidden_dim, n_classes)

    def forward(self, x: torch.Tensor):
        x = x.squeeze(0)
        hidden = self.feature_extractor(x)
        attention = self.attention(hidden)
        attention = torch.transpose(attention, 1, 0)
        attention = F.softmax(attention, dim=1)
        pooled = torch.mm(attention, hidden)
        logits = self.classifier(pooled)
        return logits, attention
