# import os
# import h5py
# import torch
# import torch.nn as nn
# import torch.nn.functional as F
# import numpy as np
# import matplotlib.pyplot as plt

# # =========================
# # 1. 搬运极其轻量的注意力网络 (必须和训练时一模一样)
# # =========================
# class AttentionMIL(nn.Module):
#     def __init__(self):
#         super(AttentionMIL, self).__init__()
#         self.feature_extractor = nn.Sequential(nn.Linear(1024, 256), nn.ReLU())
#         self.attention = nn.Sequential(nn.Linear(256, 128), nn.Tanh(), nn.Linear(128, 1))
#         self.classifier = nn.Linear(256, 2)

#     def forward(self, x):
#         x = x.squeeze(0) 
#         H = self.feature_extractor(x)
#         A = self.attention(H)
#         A = torch.transpose(A, 1, 0)
#         A = F.softmax(A, dim=1)
#         M = torch.mm(A, H)
#         Y_prob = self.classifier(M)
#         return Y_prob, A

# # =========================
# # 2. 核心设置
# # =========================
# device = torch.device("cpu")
# model_path = "data/best_clam_model.pth"

# # 选择一张你想窥探的切片！(建议先选一张肿瘤切片)
# slide_id = "tumor_001" 

# pt_path = f"data/results/features/{slide_id}.pt"
# h5_path = f"data/results/patches/{slide_id}.h5"

# # =========================
# # 3. 加载模型与数据
# # =========================
# print(f"正在唤醒 AI 模型并查看 {slide_id} ...")
# model = AttentionMIL()
# model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
# model.eval() # 开启评估模式

# # 读取 1024 维特征矩阵
# features = torch.load(pt_path, map_location=device, weights_only=True)

# # 读取生成的物理坐标
# with h5py.File(h5_path, 'r') as f:
#     coords = f['coords'][:]

# # =========================
# # 4. 提取 AI 的“注意力分数”
# # =========================
# with torch.no_grad():
#     output, A = model(features)
#     pred_label = output.argmax(dim=1).item()
#     pred_text = "肿瘤 (Tumor)" if pred_label == 1 else "正常 (Normal)"
    
#     # 将注意力矩阵扁平化成一个一维数组 (和坐标数量一一对应)
#     attention_scores = A.squeeze(0).numpy()

# # 归一化分数 (把所有的分数按比例拉伸到 0 到 1 之间，方便上色)
# A_norm = (attention_scores - attention_scores.min()) / (attention_scores.max() - attention_scores.min() + 1e-8)

# # =========================
# # 5. 挥毫泼墨：绘制高分辨率热力图
# # =========================
# print("正在生成数字阵列热力图...")
# plt.figure(figsize=(12, 12), facecolor='black')

# x = coords[:, 0]
# y = coords[:, 1]

# # cmap='jet' 是医疗界最经典的配色：冷色(蓝)代表不关注，暖色(红)代表极度可疑
# scatter = plt.scatter(x, y, c=A_norm, cmap='jet', s=8, alpha=0.8, edgecolors='none')

# plt.colorbar(scatter, label='AI Attention Score', fraction=0.046, pad=0.04)
# plt.gca().invert_yaxis() # 翻转 Y 轴，因为图像坐标的原点在左上角
# plt.title(f"Slide: {slide_id} | AI Prediction: {pred_text}", color='white', pad=20, fontsize=16)

# # 去除多余的白边和坐标轴
# plt.axis('equal')
# plt.axis('off')

# save_path = f"data/{slide_id}_heatmap.png"
# plt.savefig(save_path, bbox_inches='tight', dpi=300, facecolor='black')
# print(f"大功告成！热力图已保存至: {save_path}")

import os
import h5py
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt
import openslide

try:
    from my_scripts.attention_mil import AttentionMIL
except ModuleNotFoundError:
    from attention_mil import AttentionMIL

# =========================
# 1. 搬运极其轻量的注意力网络
# =========================
# =========================
# 2. 核心设置
# =========================
device = torch.device("cpu")
model_path = "data/best_clam_model.pth"

# 选择切片
slide_id = "tumor_001" 

wsi_path = f"data/wsi/{slide_id}.tif"  # 新增：原图路径
pt_path = f"data/results/features/{slide_id}.pt"
h5_path = f"data/results/patches/{slide_id}.h5"

# =========================
# 3. 加载模型与提取 AI 注意力
# =========================
print(f"正在唤醒 AI 模型评估 {slide_id} ...")
model = AttentionMIL()
model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
model.eval()

features = torch.load(pt_path, map_location=device, weights_only=True)

with torch.no_grad():
    output, A = model(features)
    pred_label = output.argmax(dim=1).item()
    pred_text = "肿瘤 (Tumor)" if pred_label == 1 else "正常 (Normal)"
    attention_scores = A.squeeze(0).numpy()

# 分数归一化 (拉伸到 0~1 之间，让颜色对比更强烈)
A_norm = (attention_scores - attention_scores.min()) / (attention_scores.max() - attention_scores.min() + 1e-8)

# =========================
# 4. 读取原始切片坐标与原图
# =========================
print("正在生成高分辨率底图...")
slide = openslide.OpenSlide(wsi_path)
w_0, h_0 = slide.dimensions

with h5py.File(h5_path, 'r') as f:
    coords = f['coords'][:]

# 生成一张长边为 2000 像素的高清缩略图
scale_factor = 2000.0 / max(w_0, h_0)
thumb_w = int(w_0 * scale_factor)
thumb_h = int(h_0 * scale_factor)
thumbnail = slide.get_thumbnail((thumb_w, thumb_h))

# =========================
# 5. 矩阵融合：叠加渲染
# =========================
print("正在进行底图与热力图的半透明融合...")

# 创建一个全透明的“玻璃板” (用 np.nan 初始化)
# 只要没被 AI 打分的地方，就保持完全透明，露出底下的白玻璃
heatmap_layer = np.full((thumb_h, thumb_w), np.nan)

# 计算 256x256 图块在缩略图上的真实大小
patch_size_scaled = max(1, int(256 * scale_factor))

# 将 AI 打分像贴瓷砖一样，填入透明玻璃板的对应位置
for i in range(len(coords)):
    x, y = coords[i]
    x_scaled = int(x * scale_factor)
    y_scaled = int(y * scale_factor)
    
    # 填充分数 (确保不会越界)
    y_end = min(y_scaled + patch_size_scaled, thumb_h)
    x_end = min(x_scaled + patch_size_scaled, thumb_w)
    heatmap_layer[y_scaled:y_end, x_scaled:x_end] = A_norm[i]

# =========================
# 6. 最终出图
# =========================
plt.figure(figsize=(14, 14), dpi=300)

# 第一层：铺垫原始医学切片
plt.imshow(thumbnail)

# 第二层：盖上打分玻璃板 (alpha=0.5 实现半透明，cmap='jet' 实现红黄蓝渐变)
plt.imshow(heatmap_layer, cmap='jet', alpha=0.5, interpolation='nearest')

plt.colorbar(fraction=0.036, pad=0.04, label='AI Tumor Probability (Attention Score)')
plt.title(f"Slide: {slide_id} | AI Prediction: {pred_text}", fontsize=18, fontweight='bold', pad=20)
plt.axis('off')

save_path = f"data/{slide_id}_overlay_heatmap.png"
plt.savefig(save_path, bbox_inches='tight', dpi=300, facecolor='white')
print(f"临床级热力图叠加完成！文件已保存至: {save_path}")