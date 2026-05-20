# ML Bridge

该目录保留 Python 侧的 WSI、Torch 和 OpenSlide 能力，并作为可独立部署的推理服务。

当前包含两种 bridge 入口：

- `slide_bridge.py`：CLI 能力与核心推理函数
- `server.py`：常驻 HTTP 服务，作为独立推理服务对外提供 HTTP 接口
- `requirements.txt`：该服务的 Python 依赖清单

CLI bridge 提供的命令：

- `list`：输出切片列表与诊断摘要 JSON
- `detail --slide-id <id>`：输出单张切片详情 JSON
- `render-thumbnail --slide-id <id> --output <path>`：生成缩略图缓存
- `render-heatmap --slide-id <id> --output <path>`：生成热图缓存

常驻 bridge 服务提供的接口：

- `GET /health`
- `GET /slides`
- `GET /slides/{slide_id}`
- `GET /slides/{slide_id}/assets/thumbnail`
- `GET /slides/{slide_id}/assets/heatmap`

推荐通过仓库根目录的 `pnpm dev:bridge` 启动该服务，或直接运行 `python services/ml-bridge/server.py --host 127.0.0.1 --port 4100`。

NestJS API 不再托管 Python 进程，而是在启动时等待该独立服务就绪，随后通过 HTTP 调用推理、缩略图和热图接口。因此 Python 侧可以独立部署、独立扩缩容，也能继续复用进程内模型和图像缓存。