# patho-mil-clam-uni-pipeline

WSI 弱监督分类模型。

- 输入：WSI（或 patch 集合）
- 输出：二分类（肿瘤 vs 非肿瘤）
- 方法：MIL + UNI 特征 + CLAM

## 商业化 Web 架构

仓库现已补充为前后端分离的工程结构，目标是把原来的单体原型拆成更接近成熟项目的部署形态。

### 目录划分

```text
apps/
	api/                 NestJS API 服务
	web/                 Next.js + Tailwind + shadcn 风格前端
services/
	ml-bridge/           Python ML bridge，负责 Torch/OpenSlide/热图生成
data/                  当前演示数据与已预处理资产
CLAM/                  原始 CLAM 训练与热图脚本
```

### 分层职责

- `apps/web`：数字病理工作台 UI，复刻当前 `index.html` 的三栏工作台风格。
- `apps/api`：NestJS 对外 API，负责切片列表、详情、缩略图和热图资源编排。
- `services/ml-bridge`：Python 常驻 bridge，保留现有 Torch、OpenSlide、h5py 能力，避免把推理逻辑硬迁到 Node。

这样做的好处是前后端技术栈已经切换到 NestJS + Next.js，但核心病理算法和资产生成能力仍然可以直接复用现有 Python 代码。

## 前端技术栈

- Next.js App Router
- Tailwind CSS
- shadcn 风格基础组件
- 组件化目录：`src/app`、`src/components`、`src/lib`、`src/types`

## 后端技术栈

- NestJS
- 模块化目录：`health`、`slides`
- Python bridge 通过常驻 HTTP 服务接入 ML 能力
- API 前缀：`/api/v1`

## 当前已实现能力

- 浏览项目内已有数字切片
- 查看切片缩略图并叠加热图
- 返回切片级诊断结果、概率、patch 数量和推理耗时
- 前端工作台复刻当前 `index.html` 的商业化布局风格

## 安装与启动

本项目采用双环境运行：

- Node.js + pnpm：负责 `apps/web`、`apps/api` 和桌面壳的开发与构建
- Python：负责 `services/ml-bridge` 的模型推理、OpenSlide 读片和热图生成

推荐先准备 Python 环境，再安装 pnpm 工作区依赖。

### 1. 准备 Python 环境

建议使用独立虚拟环境，例如 conda 或 venv。Python 侧至少需要能安装并运行以下依赖：

- torch
- h5py
- numpy
- openslide-python
- pillow
- fastapi
- uvicorn[standard]

仓库已提供 ML Bridge 的依赖清单：

```bash
pip install -r services/ml-bridge/requirements.txt
```

如果你使用 Windows 且通过 `pip` 安装 OpenSlide，通常还需要额外安装底层 OpenSlide 二进制环境。

`services/ml-bridge/slide_bridge.py` 会直接复用仓库里的模型权重、特征和 patch 资产。

### 2. 安装 Node.js 依赖

本仓库统一使用 pnpm workspace 管理 `apps/*`。

在仓库根目录执行：

```bash
pnpm install
```

### 3. 配置环境变量

可参考以下文件：

- `apps/api/.env.example`
- `apps/web/.env.example`

常见本地开发地址：

- Web：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:4000`
- ML Bridge：`http://127.0.0.1:4100`

如果 `pnpm dev:bridge` 需要使用指定 Python 解释器，可在 `apps/api/.env.local` 中配置：

```env
ML_PYTHON_EXECUTABLE=C:\Users\<your-user>\.conda\envs\<env-name>\python.exe
ML_BRIDGE_URL=http://127.0.0.1:4100
ML_BRIDGE_SERVER_SCRIPT=services/ml-bridge/server.py
```

### 4. 启动方式

一键启动整个开发环境：

```bash
pnpm dev
```

该命令会并行启动：

- Python ML Bridge
- NestJS API
- Next.js Web

如果只想分开启动，可分别执行：

```bash
pnpm dev:bridge
pnpm dev:api
pnpm dev:web
```

如果需要桌面壳：

```bash
pnpm dev:desktop
```

### 5. 常用构建与检查命令

```bash
pnpm build:api
pnpm build:web
pnpm build:desktop

pnpm lint:api
pnpm lint:web
pnpm lint:desktop
```

### 6. ML Bridge 单独验证

验证 Python 侧是否能直接读取现有资产：

```bash
python services/ml-bridge/slide_bridge.py detail --slide-id tumor_001
```

如果要绕过 Node 启动器，直接运行独立 Bridge 服务：

```bash
python services/ml-bridge/server.py --host 127.0.0.1 --port 4100
```

### 7. 推荐启动顺序

首次配置建议按这个顺序执行：

1. 创建并激活 Python 环境
2. `pip install -r services/ml-bridge/requirements.txt`
3. `pnpm install`
4. 配置 `apps/api/.env.local` 和 `apps/web/.env.local`
5. `pnpm dev`

## ML Bridge 验证

已验证以下命令可以读取现有资产并输出 JSON：

```bash
python services/ml-bridge/slide_bridge.py detail --slide-id tumor_001
```

如需绕过 Node 启动器，直接运行独立 bridge 服务，也可以执行：

```bash
python services/ml-bridge/server.py --host 127.0.0.1 --port 4100
```

## 下一步建议

当前架构已经适合继续扩展这些能力：

- 接入文件上传与异步预处理流水线
- 给 NestJS 增加鉴权、审计日志和任务状态查询
- 将 Python bridge 升级为独立推理服务
- 为 Next.js 前端补充真正的瓦片级 WSI 浏览器
