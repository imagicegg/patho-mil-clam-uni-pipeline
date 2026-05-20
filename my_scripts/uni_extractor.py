import os
import h5py
import torch
from torchvision import transforms
import timm
from tqdm import tqdm
import openslide
import warnings
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
import threading

warnings.filterwarnings("ignore", category=FutureWarning)

# =========================
# 1. 设备 (强制纯 CPU 模式)
# =========================
device = torch.device("cpu")
print("纯 CPU 模式已启动（无显卡环境）")

# =========================
# 2. 路径
# =========================
wsi_dir = "data/wsi"
h5_dir = "data/results/patches"
save_dir = "data/results/features"
local_weight_path = "local_models/pytorch_model.bin"

os.makedirs(save_dir, exist_ok=True)

# =========================
# 3. 模型
# =========================
print(f"加载 UNI 权重: {local_weight_path}")

model = timm.create_model(
    "vit_large_patch16_224",
    pretrained=False,
    init_values=1e-5,
    dynamic_img_size=True,
    num_classes=0
)

# 直接加载到 CPU 内存中
state_dict = torch.load(local_weight_path, map_location="cpu")
model.load_state_dict(state_dict, strict=True)

model = model.to(device)
model.eval()

print("模型加载完成")

# =========================
# 4. transform
# =========================
transform = transforms.Compose([
    transforms.Resize(224),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=(0.485, 0.456, 0.406),
        std=(0.229, 0.224, 0.225)
    ),
])

# =========================
# 5. 参数（为笔记本 CPU 量身下调）
# =========================
# 笔记本内存有限，Batch Size 减半保平安
BATCH_SIZE = 16 
NUM_WORKERS = 8
QUEUE_SIZE = 10   # 预取队列大小

# =========================
# 6. 批量预取生产者（后台包工头）
# =========================
def batch_producer(slide, coords, queue, batch_size, num_workers):
    # 单个图块的切图任务
    def fetch_patch(coord):
        x, y = coord
        img = slide.read_region((x, y), 0, (256, 256)).convert("RGB")
        return transform(img)

    # 启动多线程池
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        for i in range(0, len(coords), batch_size):
            batch_coords = coords[i : i + batch_size]
            
            # 并发去硬盘抠图
            batch_imgs = list(executor.map(fetch_patch, batch_coords))
            
            # 把图片合并成一个大 Tensor
            batch_tensor = torch.stack(batch_imgs)
            
            # 塞入预取队列
            queue.put(batch_tensor)

    queue.put(None)  # 结束信号

# =========================
# 7. 主流程 (CPU 慢速榨汁机)
# =========================
h5_files = [f for f in os.listdir(h5_dir) if f.endswith(".h5")]

# 定义黑名单，跳过之前损坏的文件
blacklist = ["tumor_006"] 

for h5_name in h5_files:
    slide_id = h5_name.replace(".h5", "")
    
    # 遇到黑名单里的切片，直接跳过
    if slide_id in blacklist:
        print(f"命中黑名单，跳过损坏的切片: {slide_id}")
        continue
    
    # 断点续传保护机制
    save_path = os.path.join(save_dir, f"{slide_id}.pt")
    if os.path.exists(save_path):
        print(f"发现已存在: {slide_id}.pt，直接跳过...")
        continue

    slide_path = os.path.join(wsi_dir, f"{slide_id}.tif")

    if not os.path.exists(slide_path):
        continue

    print(f"\n---> 处理切片: {slide_id}")
    slide = openslide.OpenSlide(slide_path)

    with h5py.File(os.path.join(h5_dir, h5_name), "r") as f:
        coords = f["coords"][:]

    queue = Queue(maxsize=3)

    producer_thread = threading.Thread(
        target=batch_producer,
        args=(slide, coords, queue, BATCH_SIZE, NUM_WORKERS)
    )
    producer_thread.start()

    features = []

    with torch.no_grad():
        pbar = tqdm(total=len(coords), desc="特征提纯中")

        while True:
            batch_tensor = queue.get()

            if batch_tensor is None:
                break

            # 送入 CPU 并推理 (这里是整个程序最耗时的瓶颈)
            batch_tensor = batch_tensor.to(device)
            feats = model(batch_tensor)
            
            features.append(feats.cpu())
            pbar.update(len(batch_tensor))

        pbar.close()

    producer_thread.join()

    final_features = torch.cat(features, dim=0)
    save_path = os.path.join(save_dir, f"{slide_id}.pt")
    torch.save(final_features, save_path)

    print(f"{slide_id} 完成: {final_features.shape}")

print("\n全部完成！")