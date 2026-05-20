import os
import pandas as pd

feature_dir = "data/results/features"
csv_path = "data/dataset.csv"

# 动态扫描现有的 .pt 文件
pt_files = [f for f in os.listdir(feature_dir) if f.endswith('.pt')]

data = []
for f in pt_files:
    slide_id = f.replace('.pt', '')
    # 根据文件名自动打标签
    label = 0 if 'normal' in slide_id else 1
    data.append({'slide_id': slide_id, 'label': label})

df = pd.DataFrame(data)
df.to_csv(csv_path, index=False)

print(f"点名册生成完毕！共收录 {len(df)} 张切片。")
print(f"路径: {csv_path}")
print(df['label'].value_counts().rename(index={0: '正常 (Normal)', 1: '肿瘤 (Tumor)'}))