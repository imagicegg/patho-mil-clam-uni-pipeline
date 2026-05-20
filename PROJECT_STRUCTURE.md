# patho-mil-clam-uni-pipeline 项目结构说明

## 一、项目定位

数字病理辅助诊断系统，基于 WSI（全切片图像）弱监督分类，实现肿瘤/非肿瘤二分类诊断。

- **输入**：WSI 全切片图像（.svs / .tif / .tiff / .ndpi / .mrxs）
- **输出**：二分类诊断结果（Tumor / Normal）+ 注意力热力图 + 疑似病灶定位
- **方法**：UNI 基础模型特征提取 + AttentionMIL（CLAM 变体）分类

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Desktop Shell  (apps/desktop)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js Web Frontend  (apps/web) :3000                  │  │
│  │  - OpenSeadragon WSI Viewer                               │  │
│  │  - Tailwind CSS + shadcn/ui                               │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │ HTTP                                  │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │  NestJS API Backend  (apps/api) :4000                     │  │
│  │  - Slides Controller / Service                             │  │
│  │  - ML Bridge Service (HTTP 代理)                           │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │ HTTP                                  │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │  ML Bridge (services/ml-bridge) :4100                     │  │
│  │  - OpenSlide WSI 读取 + DeepZoom 瓦片生成                  │  │
│  │  - UNI/CLAM 模型推理                                       │  │
│  │  - 注意力热力图 + 疑似灶定位                                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**数据流**：前端 → NestJS API（:4000）→ ML Bridge Python（:4100）→ 模型推理 / OpenSlide 切片读取

---

## 三、根目录结构

```
patho-mil-clam-uni-pipeline/
├── .vscode/                  # VS Code 编辑器配置
├── apps/                     # 前端/后端应用（pnpm workspace）
├── CLAM/                     # CLAM 核心库（Python 病理图像分析框架）
├── data/                     # 数据目录（WSI、特征、模型权重等）
├── local_models/             # 本地模型权重文件
├── my_scripts/               # 自定义精简 Pipeline 脚本
├── scripts/                  # Node.js 运行脚本
├── services/                 # 微服务
├── .gitignore
├── README.md
├── index.html                # 早期静态原型页面
├── package.json              # pnpm 根配置
├── pnpm-workspace.yaml       # pnpm 工作区定义
├── pnpm-lock.yaml
└── tsconfig.base.json        # TypeScript 基础配置
```

### 根目录配置文件

| 文件 | 用途 |
|------|------|
| `package.json` | pnpm 根配置，通过 `concurrently` 并行启动 ML Bridge + API + Web |
| `pnpm-workspace.yaml` | pnpm 工作区定义，统一管理 `apps/*` |
| `tsconfig.base.json` | TypeScript 基础配置（ES2022 / CommonJS / Strict），供子项目继承 |
| `index.html` | 早期静态原型页面（TailwindCSS CDN + 三栏布局），已被 Next.js 前端替代 |
| `.gitignore` | Git 忽略规则 |

---

## 四、apps/ — 应用层

### 4.1 apps/api/ — NestJS 后端 API 服务

**技术栈**：NestJS 11 + TypeScript + class-validator + class-transformer

**职责**：对外提供 REST API，作为前端与 Python ML Bridge 之间的编排层。

```
apps/api/
├── src/
│   ├── main.ts                          # 应用入口
│   ├── app.module.ts                    # 根模块
│   └── modules/
│       ├── health/                      # 健康检查模块
│       │   ├── health.controller.ts     # GET /api/v1/health
│       │   └── health.module.ts
│       └── slides/                      # 切片管理模块
│           ├── interfaces/
│           │   └── slide.interface.ts   # SlideRecord / SlideDiagnosis 类型定义
│           ├── ml-bridge.service.ts     # ML Bridge HTTP 通信服务
│           ├── slides.controller.ts     # 切片相关 API 端点
│           ├── slides.module.ts         # 模块定义
│           └── slides.service.ts        # 切片业务逻辑（代理到 ML Bridge）
├── .env.example                         # 环境变量示例
├── .env.local                           # 本地环境变量
├── nest-cli.json                        # NestJS CLI 配置
├── package.json                         # @patho/api
├── tsconfig.json                        # TypeScript 配置（继承 tsconfig.base.json）
└── tsconfig.build.json                  # 构建用 TS 配置
```

#### API 端点一览

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v1/health` | GET | 健康检查 |
| `/api/v1/slides` | GET | 列出所有切片 |
| `/api/v1/slides/:slideId` | GET | 获取切片详情 |
| `/api/v1/slides/:slideId/assets/thumbnail` | GET | 缩略图（JPEG） |
| `/api/v1/slides/:slideId/assets/focus-roi/:x/:y/:w/:h.jpg` | GET | 疑似灶 ROI 裁剪图 |
| `/api/v1/slides/:slideId/assets/heatmap` | GET | 热力图（PNG） |
| `/api/v1/slides/:slideId/wsi.dzi` | GET | WSI DeepZoom 描述文件 |
| `/api/v1/slides/:slideId/wsi_files/:level/:col_:row.jpeg` | GET | WSI DeepZoom 瓦片 |
| `/api/v1/slides/:slideId/heatmap.dzi` | GET | 热力图 DeepZoom 描述文件 |
| `/api/v1/slides/:slideId/heatmap_files/:level/:col_:row.png` | GET | 热力图 DeepZoom 瓦片 |
| `/api/v1/slides/:slideId/ai-heatmap.dzi` | GET | AI 热力图 DZI（别名） |
| `/api/v1/slides/:slideId/ai-heatmap_files/:level/:col_:row.png` | GET | AI 热力图瓦片（别名） |

#### 核心服务

- **MlBridgeService**：与 Python ML Bridge 通信的 HTTP 客户端。启动时轮询 `/health` 等待 Bridge 就绪（超时 15s），提供 `getJson<T>()` 和 `getBinary()` 两个方法。
- **SlidesService**：切片业务逻辑层，所有方法均代理到 MlBridgeService，将二进制数据转为 Node Stream 返回。

#### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 4000 | API 服务端口 |
| `WEB_ORIGIN` | http://localhost:3000 | 前端地址（CORS） |
| `ML_BRIDGE_URL` | http://127.0.0.1:4100 | ML Bridge 地址 |
| `ML_BRIDGE_STARTUP_TIMEOUT_MS` | 15000 | Bridge 启动等待超时 |
| `ML_PYTHON_EXECUTABLE` | python | Python 可执行文件路径 |

---

### 4.2 apps/web/ — Next.js 前端 Web 应用

**技术栈**：Next.js 15 + React 18 + Tailwind CSS 3 + shadcn/ui + OpenSeadragon 6

**职责**：数字病理辅助诊断工作台 UI，提供 WSI 浏览、AI 热力图叠加、诊断报告展示。

```
apps/web/
├── public/                              # 静态资源
│   ├── favicon.ico / favicon.svg / favicon-96x96.png
│   ├── apple-touch-icon.png
│   ├── logo.png                         # 品牌 Logo
│   ├── web-app-manifest-192x512.png
│   └── site.webmanifest                 # PWA 清单
├── src/
│   ├── app/                             # Next.js App Router
│   │   ├── globals.css                  # 全局样式（Tailwind + CSS 变量主题 + 自定义工具类）
│   │   ├── layout.tsx                   # 根布局（Noto Sans SC + Space Grotesk 字体）
│   │   └── page.tsx                     # 首页（渲染 PathologyWorkbench）
│   ├── components/
│   │   ├── dashboard/                   # 业务组件
│   │   │   ├── pathology-workbench.tsx  # 病理工作台（三栏布局主组件）
│   │   │   └── wsi-viewer.tsx           # WSI 查看器（OpenSeadragon 封装）
│   │   └── ui/                          # shadcn/ui 基础组件
│   │       ├── badge.tsx                # 徽章
│   │       ├── button.tsx               # 按钮
│   │       ├── card.tsx                 # 卡片
│   │       └── input.tsx                # 输入框
│   ├── lib/
│   │   ├── api.ts                       # API 请求封装
│   │   └── utils.ts                     # 工具函数（cn 类名合并）
│   └── types/
│       └── slide.ts                     # SlideRecord / SlideDiagnosis 类型定义
├── .env.example                         # NEXT_PUBLIC_API_BASE_URL
├── components.json                      # shadcn/ui 配置
├── next.config.mjs                      # Next.js 配置
├── package.json                         # @patho/web
├── postcss.config.js                    # PostCSS 配置
├── tailwind.config.ts                   # Tailwind 配置（CSS 变量主题 + 自定义阴影/字体）
└── tsconfig.json                        # TypeScript 配置（路径别名 @/* → ./src/*）
```

#### 核心组件

| 组件 | 功能 |
|------|------|
| `PathologyWorkbench` | 三栏布局主组件：左侧切片列表 + 中央 WSI 查看器 + 右侧 AI 诊断报告 |
| `WsiViewer` | OpenSeadragon 封装，支持 DeepZoom 瓦片浏览、热力图叠加、缩放/坐标追踪、疑似灶定位 |

#### 样式体系

- **主题**：CSS 变量驱动的 shadcn/ui 主题系统（Slate 色系）
- **字体**：Noto Sans SC（正文）+ Space Grotesk（标题/数据）
- **自定义工具类**：`.he-stain-bg`（H&E 染色底纹）、`.scrollbar-subtle`（细滚动条）
- **自定义阴影**：`shadow-soft`、`shadow-panel`
- **响应式断点**：1100px（三栏→单栏）、720px（控件堆叠）

---

### 4.3 apps/desktop/ — Electron 桌面端

**技术栈**：Electron 37

**职责**：将 Web 前端封装为桌面应用程序。

```
apps/desktop/
├── main.js          # Electron 主进程（创建 BrowserWindow，加载 Next.js 页面）
├── preload.js       # 预加载脚本（当前为空占位）
└── package.json     # @patho/desktop
```

- 窗口尺寸：1600×980，最小 1200×760
- 安全配置：`contextIsolation: true`、`nodeIntegration: false`
- 新窗口请求转交系统浏览器处理
- 通过 `PATHO_DESKTOP_URL` 环境变量配置加载地址（默认 `http://127.0.0.1:3000`）

---

## 五、services/ — 微服务层

### 5.1 services/ml-bridge/ — Python ML Bridge 服务

**技术栈**：FastAPI + Uvicorn + PyTorch + OpenSlide + h5py + NumPy + Pillow

**职责**：核心病理 AI 推理服务，提供 WSI 读取、模型推理、热力图生成、DeepZoom 瓦片服务。

```
services/ml-bridge/
├── server.py           # FastAPI 服务入口（HTTP 端点定义）
├── slide_bridge.py     # 核心业务逻辑（WSI 读取、推理、热力图、瓦片生成）
└── README.md
```

#### server.py — API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/slides` | GET | 列出所有切片 |
| `/slides/{slide_id}` | GET | 切片详情 |
| `/slides/{slide_id}/assets/thumbnail` | GET | 缩略图（JPEG） |
| `/slides/{slide_id}/focus-roi.jpg` | GET | 疑似灶 ROI 缩略图 |
| `/slides/{slide_id}/assets/heatmap` | GET | 热力图（PNG） |
| `/slides/{slide_id}/heatmap.dzi` | GET | 热力图 DZI 描述 |
| `/slides/{slide_id}/heatmap_files/{level}/{col}_{row}.png` | GET | 热力图瓦片 |
| `/slides/{slide_id}/wsi.dzi` | GET | WSI DZI 描述 |
| `/slides/{slide_id}/wsi_files/{level}/{col}_{row}.jpeg` | GET | WSI 瓦片 |

#### slide_bridge.py — 核心功能模块

| 功能 | 函数 | 说明 |
|------|------|------|
| WSI 读取 | `get_slide()` | OpenSlide 读取，LRU 缓存（8 个） |
| 切片序列化 | `serialize_slide()` | 组装切片元数据 + 诊断结果 + MPP/物镜倍率 |
| 模型推理 | `run_inference()` | AttentionMIL 前向推理，返回预测标签 + 概率 + 注意力分数 |
| 诊断摘要 | `summarize_inference()` | 推理 + 疑似灶定位汇总 |
| 注意力评分 | `get_tumor_warning_scores()` | 计算肿瘤证据分数（tumor-minus-normal 差异图 + 置信度门控） |
| 疑似灶定位 | `get_tumor_warning_summary()` | 连通域分析，识别可疑病灶区域 |
| 热力图生成 | `get_heatmap_overlay()` / `compose_heatmap_image()` | 注意力分数 → 颜色映射 → RGBA 叠加层 |
| DeepZoom 瓦片 | `get_deepzoom()` / `get_slide_tile()` / `get_heatmap_tile()` | OpenSlide DeepZoomGenerator 瓦片服务 |
| 缩略图 | `build_thumbnail()` | WSI 缩略图生成 |
| ROI 缩略图 | `build_focus_roi_thumbnail()` | 疑似灶区域裁剪缩略图 |
| CLI 模式 | `command_list()` / `command_detail()` / ... | 命令行直接调用（不启动 HTTP 服务） |

#### 关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `HEATMAP_TILE_SIZE` | 254 | DeepZoom 瓦片尺寸 |
| `HEATMAP_TILE_OVERLAP` | 1 | 瓦片重叠像素 |
| `WARNING_FOCUS_CONNECTIVITY_RADIUS` | 2 | 连通域搜索半径 |
| `WARNING_FOCUS_MIN_PATCHES` | 3 | 最小病灶 patch 数 |
| `HEATMAP_OVERLAY_SCORE_THRESHOLD` | 0.2 | 热力图显示阈值 |
| `FOCUS_ROI_THUMBNAIL_MAX_DIM` | 224 | ROI 缩略图最大边长 |

---

## 六、CLAM/ — CLAM 核心库

CLAM（Clustering-constrained Attention Multiple Instance Learning）是源自 Mahmood Lab 的开源病理图像 MIL 框架，本项目已扩展支持 UNI、CONCH 等基础模型。

```
CLAM/
├── main.py                     # 训练主入口（K 折交叉验证）
├── eval.py                     # 评估入口（AUC / ACC 计算）
├── extract_features.py         # 特征提取（从 h5 图块）
├── extract_features_fp.py      # 特征提取（从 WSI 原图 + h5 坐标）
├── create_patches.py           # WSI 分割+切图（旧版，含图像存储）
├── create_patches_fp.py        # WSI 分割+切图（新版，仅存坐标）
├── create_heatmaps.py          # 热力图推理生成
├── create_splits_seq.py        # 数据集 K 折划分
├── build_preset.py             # 预设参数构建器
├── env.yml                     # Conda 环境配置
├── dataset_csv/                # 数据集 CSV 文件
├── dataset_modules/            # 数据集加载模块
│   ├── dataset_generic.py      # 通用 WSI 分类数据集 + MIL 特征数据集
│   ├── dataset_h5.py           # H5 格式图块/坐标数据集
│   └── wsi_dataset.py          # WSI 区域数据集（热力图推理用）
├── models/                     # 模型定义
│   ├── model_clam.py           # CLAM_SB / CLAM_MB（门控注意力 + 实例聚类）
│   ├── model_mil.py            # MIL_fc / MIL_fc_mc（基线 MIL）
│   ├── builder.py              # 编码器工厂（ResNet50 / UNI / CONCH / TITAN）
│   ├── timm_wrapper.py         # Timm CNN 编码器封装
│   └── resnet_custom_dep.py    # 自定义 ResNet（已弃用）
├── utils/                      # 工具函数
│   ├── core_utils.py           # 训练/验证/早停核心逻辑
│   ├── eval_utils.py           # 评估工具
│   ├── file_utils.py           # 文件 I/O（pickle / HDF5）
│   ├── utils.py                # DataLoader / 优化器 / K 折划分
│   ├── constants.py            # 归一化常量（ImageNet / OpenAI）
│   └── transform_utils.py      # 图像预处理流水线
├── wsi_core/                   # 全切片图像核心处理
│   ├── WholeSlideImage.py      # WSI 类（组织分割 + 切图 + 热力图渲染）
│   ├── wsi_utils.py            # 黑白检测 / 坐标生成 / 拼接可视化
│   ├── util_classes.py         # 轮廓检查函数 / 马赛克画布
│   └── batch_process_utils.py  # 批处理参数初始化
├── vis_utils/                  # 可视化
│   └── heatmap_utils.py        # 热力图绘制 + 逐 patch 特征计算
├── splits/                     # 交叉验证划分文件
├── presets/                    # 预设参数（BWH / TCGA）
├── heatmaps/                   # 热力图配置模板
└── docs/                       # 文档
```

---

## 七、my_scripts/ — 自定义精简 Pipeline

独立于 CLAM 的轻量级脚本集，实现了从特征提取到模型训练再到热力图可视化的完整流程。

```
my_scripts/
├── attention_mil.py    # AttentionMIL 模型定义（Linear 1024→256 + 注意力池化 → 二分类）
├── build_csv.py        # 数据集 CSV 生成（扫描 .pt 文件，按文件名自动打标签）
├── draw_heatmap.py     # 热力图绘制（注意力分数 → jet 色彩映射 → 叠加到 WSI 缩略图）
├── train_clam.py       # 模型训练（AttentionMIL + CrossEntropyLoss + Adam，10 epoch）
└── uni_extractor.py    # UNI 特征提取（ViT-L 编码器，批量推理，1024 维特征向量）
```

**Pipeline 流程**：
1. `uni_extractor.py` — 从 WSI 提取 UNI 特征 → `data/results/features/*.pt`
2. `build_csv.py` — 生成数据集标注 → `data/dataset.csv`
3. `train_clam.py` — 训练 AttentionMIL → `data/best_clam_model.pth`
4. `draw_heatmap.py` — 生成热力图 → `data/*_heatmap.png`

---

## 九、data/ — 数据目录

```
data/
├── best_clam_model.pth              # 训练好的 AttentionMIL 模型权重
├── dataset.csv                      # 数据集标注（slide_id, label）
├── tumor_001_heatmap.png            # 热力图输出
├── tumor_001_overlay_heatmap.png    # 叠加热力图输出
├── results/
│   ├── features/                    # UNI 特征向量（.pt，1024 维）
│   ├── masks/                       # 组织区域掩膜（.jpg）
│   ├── patches/                     # Patch 坐标（.h5，含 coords + patch_size/patch_level 属性）
│   ├── stitches/                    # Patch 拼接预览图（.jpg）
│   └── process_list_autogen.csv     # 自动生成的预处理参数清单
└── wsi/                             # 原始全切片图像（.tif，20 张：10 正常 + 10 肿瘤）
```

---

## 十、scripts/ — 运行脚本

```
scripts/
└── run-ml-bridge.mjs    # ML Bridge 进程管理器
```

**run-ml-bridge.mjs** 功能：
- 自定义 `.env` 文件解析器，按优先级合并 `.env.example` < `.env.local` < `process.env`
- 启动前健康检查：若 ML Bridge 已在运行则复用，否则 spawn Python 子进程
- 信号转发：SIGINT / SIGTERM 转发给 Python 子进程，确保优雅退出
- 可配置项：`ML_BRIDGE_URL`、`ML_PYTHON_EXECUTABLE`、`ML_BRIDGE_SERVER_SCRIPT`

---

## 十一、local_models/ — 本地模型权重

存放 UNI 等基础模型的权重文件（如 `pytorch_model.bin`），供 `uni_extractor.py` 和 `CLAM/models/builder.py` 加载使用。

---

## 十二、.vscode/ — 编辑器配置

| 文件 | 配置内容 |
|------|----------|
| `launch.json` | 调试启动项 "Launch Pathology Desktop"（`npm run dev:desktop`） |
| `settings.json` | Python 环境管理器指定为 Conda |

---

## 十三、类型定义对照

项目中存在三处 `SlideRecord` 类型定义，需保持同步：

| 位置 | 语言 | 字段 |
|------|------|------|
| `apps/web/src/types/slide.ts` | TypeScript | id, filename, width, height, **mpp_x**, **objective_power**, diagnosis, patch_count, status |
| `apps/api/src/modules/slides/interfaces/slide.interface.ts` | TypeScript | id, filename, width, height, diagnosis, patch_count, status |
| `services/ml-bridge/slide_bridge.py` → `serialize_slide()` | Python | id, filename, width, height, **mpp_x**, **objective_power**, diagnosis, patch_count, status |

---

## 十四、启动命令一览

| 命令 | 说明 |
|------|------|
| `npm run dev` | 并行启动 ML Bridge + API + Web |
| `npm run dev:bridge` | 仅启动 ML Bridge |
| `npm run dev:api` | 仅启动 NestJS API（:4000） |
| `npm run dev:web` | 仅启动 Next.js Web（:3000） |
| `npm run dev:desktop` | 启动全部 + Electron 桌面壳 |
| `npm run build:api` | 构建 NestJS API |
| `npm run build:web` | 构建 Next.js Web |
| `npm run build:desktop` | 构建 Electron 桌面端 |
| `npm run lint:api` / `lint:web` / `lint:desktop` | 代码检查 |
