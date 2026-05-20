from __future__ import annotations

import argparse
import json
import math
import sys
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import h5py
import numpy as np
import openslide
from openslide.deepzoom import DeepZoomGenerator
from PIL import Image, ImageFilter
import torch

from my_scripts.attention_mil import AttentionMIL


DATA_DIR = ROOT_DIR / "data"
WSI_DIR = DATA_DIR / "wsi"
FEATURE_DIR = DATA_DIR / "results" / "features"
PATCH_DIR = DATA_DIR / "results" / "patches"
MODEL_PATH = DATA_DIR / "best_clam_model.pth"
SLIDE_METADATA_PATH = DATA_DIR / "slide_metadata.json"

SLIDE_EXTENSIONS = {".svs", ".tif", ".tiff", ".ndpi", ".mrxs"}
LABEL_MAP = {0: "Normal", 1: "Tumor"}
FALLBACK_ANATOMY_LOCATION = "乳腺前哨淋巴结"
FALLBACK_STAIN_TYPE = "H&E"
HEATMAP_TILE_SIZE = 254
HEATMAP_TILE_OVERLAP = 1
WARNING_FOCUS_CONNECTIVITY_RADIUS = 2
WARNING_FOCUS_MIN_PATCHES = 3
HEATMAP_OVERLAY_SCORE_THRESHOLD = 0.2
HEATMAP_TILE_RENDER_MAX_DIM = 4096
HEATMAP_CMAP = np.array(
    [
        [255, 214, 10],
        [255, 167, 38],
        [255, 112, 67],
        [229, 57, 53],
        [139, 0, 0],
    ],
    dtype=np.float32,
)
FOCUS_ROI_THUMBNAIL_MAX_DIM = 224
FOCUS_ROI_PADDING_RATIO = 0.35


def iter_slides() -> list[Path]:
    if not WSI_DIR.exists():
        return []
    return sorted(path for path in WSI_DIR.iterdir() if path.suffix.lower() in SLIDE_EXTENSIONS)


def slide_path(slide_id: str) -> Path:
    for path in iter_slides():
        if path.stem == slide_id:
            return path
    raise FileNotFoundError(f"Slide '{slide_id}' not found")


def has_inference_assets(slide_id: str) -> bool:
    return (FEATURE_DIR / f"{slide_id}.pt").exists() and (PATCH_DIR / f"{slide_id}.h5").exists()


@lru_cache(maxsize=1)
def get_slide_metadata_map() -> dict[str, dict[str, Any]]:
    if not SLIDE_METADATA_PATH.exists():
        return {}

    payload = json.loads(SLIDE_METADATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {}

    return {str(key): value for key, value in payload.items() if isinstance(value, dict)}


def build_fallback_slide_metadata(slide_id: str) -> dict[str, str]:
    stem = slide_id.strip()
    prefix, _, numeric_suffix = stem.partition("_")

    try:
        ordinal = max(1, int(numeric_suffix))
    except ValueError:
        ordinal = 1

    slide_group = "tumor" if prefix.lower() == "tumor" else "normal"
    group_code = "T" if slide_group == "tumor" else "N"

    return {
        "slice_no": f"CAM16-{group_code}-{ordinal:03d}",
        "anatomy_location": FALLBACK_ANATOMY_LOCATION,
        "stain_type": FALLBACK_STAIN_TYPE,
    }


def get_slide_metadata(slide_id: str) -> dict[str, Any]:
    overrides = get_slide_metadata_map().get(slide_id, {})
    fallback = build_fallback_slide_metadata(slide_id)

    return {
        "slice_no": overrides.get("slice_no") or fallback["slice_no"],
        "anatomy_location": overrides.get("anatomy_location") or fallback["anatomy_location"],
        "stain_type": overrides.get("stain_type") or fallback["stain_type"],
    }


@lru_cache(maxsize=8)
def get_slide(slide_id: str) -> openslide.OpenSlide:
    return openslide.OpenSlide(str(slide_path(slide_id)))


@lru_cache(maxsize=1)


def build_focus_roi_thumbnail(
    slide_id: str,
    x: int,
    y: int,
    width: int,
    height: int,
    max_dim: int = FOCUS_ROI_THUMBNAIL_MAX_DIM,
    padding_ratio: float = FOCUS_ROI_PADDING_RATIO,
) -> Image.Image:
    slide = get_slide(slide_id)
    slide_width, slide_height = slide.dimensions

    roi_width = max(1, int(width))
    roi_height = max(1, int(height))
    pad_x = int(round(roi_width * max(padding_ratio, 0.0)))
    pad_y = int(round(roi_height * max(padding_ratio, 0.0)))

    left = max(0, int(x) - pad_x)
    top = max(0, int(y) - pad_y)
    right = min(slide_width, int(x) + roi_width + pad_x)
    bottom = min(slide_height, int(y) + roi_height + pad_y)

    region_width = max(1, right - left)
    region_height = max(1, bottom - top)
    target_max_dim = max(64, int(max_dim))
    downsample = max(region_width, region_height) / float(target_max_dim)
    level = slide.get_best_level_for_downsample(max(downsample, 1.0))
    level_downsample = float(slide.level_downsamples[level])
    read_size = (
        max(1, int(math.ceil(region_width / level_downsample))),
        max(1, int(math.ceil(region_height / level_downsample))),
    )

    region = slide.read_region((left, top), level, read_size).convert("RGB")
    if max(region.size) > target_max_dim:
        scale = target_max_dim / float(max(region.size))
        region = region.resize(
            (
                max(1, int(round(region.size[0] * scale))),
                max(1, int(round(region.size[1] * scale))),
            ),
            Image.Resampling.LANCZOS,
        )

    return region
def get_model() -> AttentionMIL:
    model = AttentionMIL()
    state_dict = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def get_features(slide_id: str) -> torch.Tensor:
    return torch.load(FEATURE_DIR / f"{slide_id}.pt", map_location="cpu", weights_only=True)


def get_coords(slide_id: str) -> np.ndarray:
    with h5py.File(PATCH_DIR / f"{slide_id}.h5", "r") as handle:
        return handle["coords"][:]


@lru_cache(maxsize=64)
def get_patch_metadata(slide_id: str) -> tuple[int, int]:
    with h5py.File(PATCH_DIR / f"{slide_id}.h5", "r") as handle:
        coords = handle["coords"]
        patch_size = int(coords.attrs.get("patch_size", 256))
        patch_level = int(coords.attrs.get("patch_level", 0))
    return patch_size, patch_level


@lru_cache(maxsize=64)
def run_inference(slide_id: str) -> dict[str, Any]:
    features = get_features(slide_id)
    started_at = time.perf_counter()

    with torch.inference_mode():
        logits, attention = get_model()(features)
        probabilities = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()
        predicted_index = int(np.argmax(probabilities))
        attention_scores = attention.squeeze(0).cpu().numpy()

    return {
        "slide_id": slide_id,
        "predicted_index": predicted_index,
        "predicted_label": LABEL_MAP[predicted_index],
        "probabilities": [float(value) for value in probabilities.tolist()],
        "attention": attention_scores,
        "runtime_seconds": float(time.perf_counter() - started_at),
    }


def summarize_inference(slide_id: str) -> dict[str, Any]:
    result = run_inference(slide_id)
    warning_summary = get_tumor_warning_summary(slide_id)
    return {
        "slide_id": result["slide_id"],
        "predicted_index": result["predicted_index"],
        "predicted_label": result["predicted_label"],
        "probabilities": result["probabilities"],
        "runtime_seconds": result["runtime_seconds"],
        "warning_summary": warning_summary,
    }


@lru_cache(maxsize=64)
def get_tumor_warning_scores(slide_id: str) -> np.ndarray:
    features = get_features(slide_id)
    model = get_model()

    with torch.inference_mode():
        bags = features.squeeze(0)
        hidden = model.feature_extractor(bags)
        attention_logits = model.attention(hidden)
        attention = torch.softmax(attention_logits.transpose(1, 0), dim=1).squeeze(0)

        # Tumor-minus-normal difference map: only keep positive tumor-favoring evidence.
        margin_weight = model.classifier.weight[1] - model.classifier.weight[0]
        tumor_minus_normal = hidden @ margin_weight
        evidence = torch.relu(tumor_minus_normal) * attention
        tumor_probability = torch.softmax(model.classifier(torch.mm(attention.unsqueeze(0), hidden)), dim=1)[0, 1]

    scores = evidence.cpu().numpy().astype(np.float32)
    if scores.size <= 1:
        return np.ones_like(scores, dtype=np.float32)

    positive_scores = scores[scores > 0]
    if positive_scores.size == 0:
        return np.zeros_like(scores, dtype=np.float32)

    baseline = float(np.quantile(positive_scores, 0.975))
    ceiling = float(np.quantile(positive_scores, 0.999))
    if ceiling <= baseline:
        ceiling = float(positive_scores.max())

    normalized = np.clip((scores - baseline) / max(ceiling - baseline, 1e-6), 0.0, 1.0)

    confidence_gate = float(np.clip((float(tumor_probability) - 0.48) / 0.22, 0.0, 1.0))
    normalized *= confidence_gate * confidence_gate
    normalized[normalized < 0.1] = 0.0
    return normalized.astype(np.float32)


@lru_cache(maxsize=64)
def get_tumor_warning_summary(slide_id: str) -> dict[str, float | int]:
    slide = get_slide(slide_id)
    coords = np.asarray(get_coords(slide_id), dtype=np.int32)
    scores = get_tumor_warning_scores(slide_id)
    patch_size, patch_level = get_patch_metadata(slide_id)
    patch_size_level0 = max(1, int(round(patch_size * float(slide.level_downsamples[patch_level]))))

    positive_indices = np.where(scores > 0)[0]
    if positive_indices.size == 0:
        return {
            "high_risk_area_ratio": 0.0,
            "suspicious_focus_count": 0,
            "largest_focus_area_ratio": 0.0,
            "largest_focus_patch_count": 0,
            "foci": [],
        }

    positive_coords = coords[positive_indices]
    grid = {
        (int(round(x / patch_size_level0)), int(round(y / patch_size_level0))): index
        for index, (x, y) in enumerate(positive_coords.tolist())
    }
    remaining = set(grid.keys())
    components: list[dict[str, int]] = []

    while remaining:
        start = remaining.pop()
        stack = [start]
        size = 0
        min_cell_x = start[0]
        max_cell_x = start[0]
        min_cell_y = start[1]
        max_cell_y = start[1]

        while stack:
            cell_x, cell_y = stack.pop()
            size += 1
            min_cell_x = min(min_cell_x, cell_x)
            max_cell_x = max(max_cell_x, cell_x)
            min_cell_y = min(min_cell_y, cell_y)
            max_cell_y = max(max_cell_y, cell_y)
            for delta_y in range(-WARNING_FOCUS_CONNECTIVITY_RADIUS, WARNING_FOCUS_CONNECTIVITY_RADIUS + 1):
                for delta_x in range(-WARNING_FOCUS_CONNECTIVITY_RADIUS, WARNING_FOCUS_CONNECTIVITY_RADIUS + 1):
                    if delta_x == 0 and delta_y == 0:
                        continue
                    neighbor = (cell_x + delta_x, cell_y + delta_y)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)

        components.append(
            {
                "patch_count": size,
                "min_cell_x": min_cell_x,
                "max_cell_x": max_cell_x,
                "min_cell_y": min_cell_y,
                "max_cell_y": max_cell_y,
            }
        )

    focus_components = [component for component in components if component["patch_count"] >= WARNING_FOCUS_MIN_PATCHES]
    focus_components.sort(key=lambda component: component["patch_count"], reverse=True)

    slide_area = max(1, slide.dimensions[0] * slide.dimensions[1])
    patch_area = patch_size_level0 * patch_size_level0
    high_risk_patch_count = int(positive_indices.size)
    largest_focus_patch_count = max((component["patch_count"] for component in focus_components), default=0)

    foci: list[dict[str, float | int]] = []
    for index, component in enumerate(focus_components, start=1):
        min_x = component["min_cell_x"] * patch_size_level0
        min_y = component["min_cell_y"] * patch_size_level0
        max_x = (component["max_cell_x"] + 1) * patch_size_level0
        max_y = (component["max_cell_y"] + 1) * patch_size_level0
        patch_count = component["patch_count"]
        foci.append(
            {
                "id": index,
                "patch_count": patch_count,
                "area_ratio": float((patch_count * patch_area) / slide_area),
                "x": int(min_x),
                "y": int(min_y),
                "width": int(max_x - min_x),
                "height": int(max_y - min_y),
                "center_x": int(round((min_x + max_x) / 2)),
                "center_y": int(round((min_y + max_y) / 2)),
            }
        )

    return {
        "high_risk_area_ratio": float((high_risk_patch_count * patch_area) / slide_area),
        "suspicious_focus_count": int(len(focus_components)),
        "largest_focus_area_ratio": float((largest_focus_patch_count * patch_area) / slide_area),
        "largest_focus_patch_count": int(largest_focus_patch_count),
        "foci": foci,
    }


@lru_cache(maxsize=64)
def get_heatmap_patch_table(slide_id: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    slide = get_slide(slide_id)
    coords = np.asarray(get_coords(slide_id), dtype=np.int32)
    normalized = get_tumor_warning_scores(slide_id)
    patch_size, patch_level = get_patch_metadata(slide_id)
    patch_size_level0 = max(1, int(round(patch_size * float(slide.level_downsamples[patch_level]))))

    patch_boxes = np.empty((coords.shape[0], 4), dtype=np.int32)
    patch_boxes[:, 0] = coords[:, 0]
    patch_boxes[:, 1] = coords[:, 1]
    patch_boxes[:, 2] = coords[:, 0] + patch_size_level0
    patch_boxes[:, 3] = coords[:, 1] + patch_size_level0

    return patch_boxes, normalized, np.int32(patch_size_level0)


@lru_cache(maxsize=64)
def get_patch_count(slide_id: str) -> int | None:
    if not has_inference_assets(slide_id):
        return None
    return int(len(get_coords(slide_id)))


def serialize_slide(slide_id: str) -> dict[str, Any]:
    slide = get_slide(slide_id)
    diagnosis = summarize_inference(slide_id) if has_inference_assets(slide_id) else None
    status = "pending"
    if diagnosis is not None:
        status = "positive" if diagnosis["predicted_label"] == "Tumor" else "negative"
    metadata = get_slide_metadata(slide_id)

    mpp_x = float(slide.properties.get("openslide.mpp-x", 0))
    objective_power = slide.properties.get("openslide.objective-power")
    try:
        objective_power = float(objective_power) if objective_power else None
    except (ValueError, TypeError):
        objective_power = None

    return {
        "id": slide_id,
        "filename": slide_path(slide_id).name,
        "slice_no": metadata["slice_no"],
        "anatomy_location": metadata["anatomy_location"],
        "stain_type": metadata["stain_type"],
        "thumbnail_url": None,
        "ai_prediction_status": status,
        "width": slide.dimensions[0],
        "height": slide.dimensions[1],
        "mpp_x": mpp_x if mpp_x > 0 else None,
        "objective_power": objective_power,
        "diagnosis": diagnosis,
        "patch_count": get_patch_count(slide_id),
        "status": status,
    }


@lru_cache(maxsize=32)
def build_thumbnail(slide_id: str, max_dim: int = 2048) -> Image.Image:
    slide = get_slide(slide_id)
    return slide.get_thumbnail((max_dim, max_dim)).convert("RGB")


@lru_cache(maxsize=8)
def get_deepzoom(slide_id: str) -> DeepZoomGenerator:
    return DeepZoomGenerator(
        get_slide(slide_id),
        tile_size=HEATMAP_TILE_SIZE,
        overlap=HEATMAP_TILE_OVERLAP,
        limit_bounds=False,
    )


def get_slide_dzi(slide_id: str, tile_format: str = "jpeg") -> str:
    return get_deepzoom(slide_id).get_dzi(tile_format)


def get_slide_tile(slide_id: str, level: int, column: int, row: int) -> Image.Image:
    return get_deepzoom(slide_id).get_tile(level, (column, row)).convert("RGB")


def get_heatmap_dzi(slide_id: str, tile_format: str = "png") -> str:
    if not has_inference_assets(slide_id):
        raise FileNotFoundError(f"Heatmap assets for '{slide_id}' not found")
    return get_deepzoom(slide_id).get_dzi(tile_format)


def compose_heatmap_image(score_map: np.ndarray, valid_mask: np.ndarray, patch_size: int) -> Image.Image:
    blur_radius = max(1, int(round(patch_size * 0.12)))
    score_image = Image.fromarray(np.uint8(score_map * 255), mode="L").filter(
        ImageFilter.GaussianBlur(radius=blur_radius),
    )
    mask_image = Image.fromarray(np.uint8(valid_mask * 255), mode="L").filter(
        ImageFilter.GaussianBlur(radius=max(1, blur_radius // 4)),
    )

    smoothed_scores = np.asarray(score_image, dtype=np.float32) / 255.0
    smoothed_mask = np.asarray(mask_image, dtype=np.float32) / 255.0
    visible_scores = np.clip(
        (smoothed_scores - HEATMAP_OVERLAY_SCORE_THRESHOLD)
        / max(1.0 - HEATMAP_OVERLAY_SCORE_THRESHOLD, 1e-6),
        0.0,
        1.0,
    )
    region_mask = (smoothed_mask >= 0.08) & (visible_scores >= 0.04)

    cmap_positions = np.linspace(0.0, 1.0, HEATMAP_CMAP.shape[0], dtype=np.float32)
    flat_scores = visible_scores.reshape(-1)
    heatmap = np.zeros((*score_map.shape, 4), dtype=np.uint8)
    heatmap[..., 0] = np.interp(flat_scores, cmap_positions, HEATMAP_CMAP[:, 0]).reshape(score_map.shape).astype(np.uint8)
    heatmap[..., 1] = np.interp(flat_scores, cmap_positions, HEATMAP_CMAP[:, 1]).reshape(score_map.shape).astype(np.uint8)
    heatmap[..., 2] = np.interp(flat_scores, cmap_positions, HEATMAP_CMAP[:, 2]).reshape(score_map.shape).astype(np.uint8)

    alpha = np.zeros_like(visible_scores, dtype=np.uint8)
    alpha[region_mask] = np.clip(
        np.power(visible_scores[region_mask], 0.8) * smoothed_mask[region_mask] * 235.0,
        0.0,
        235.0,
    ).astype(np.uint8)
    heatmap[..., 3] = alpha
    heatmap[alpha == 0, :3] = 0
    return Image.fromarray(heatmap, mode="RGBA")


@lru_cache(maxsize=512)
def get_heatmap_tile(slide_id: str, level: int, column: int, row: int) -> Image.Image:
    if not has_inference_assets(slide_id):
        raise FileNotFoundError(f"Heatmap assets for '{slide_id}' not found")

    deepzoom = get_deepzoom(slide_id)
    ((region_origin, slide_level, region_size), tile_size) = deepzoom._get_tile_info(level, (column, row))

    slide = get_slide(slide_id)
    level_downsample = float(slide.level_downsamples[slide_level])
    region_width = max(1, int(math.ceil(region_size[0] * level_downsample)))
    region_height = max(1, int(math.ceil(region_size[1] * level_downsample)))
    region_x0, region_y0 = region_origin
    region_x1 = region_x0 + region_width
    region_y1 = region_y0 + region_height

    overlay, overlay_scale = get_heatmap_overlay(slide_id, HEATMAP_TILE_RENDER_MAX_DIM)
    tile_width, tile_height = tile_size

    crop_x0 = max(0, int(math.floor(region_x0 * overlay_scale)))
    crop_y0 = max(0, int(math.floor(region_y0 * overlay_scale)))
    crop_x1 = min(overlay.width, int(math.ceil(region_x1 * overlay_scale)))
    crop_y1 = min(overlay.height, int(math.ceil(region_y1 * overlay_scale)))

    if crop_x1 <= crop_x0 or crop_y1 <= crop_y0:
        return Image.new("RGBA", tile_size, (0, 0, 0, 0))

    tile = overlay.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    if tile.size != tile_size:
        resample = Image.Resampling.BILINEAR
        if tile.width < tile_width or tile.height < tile_height:
            resample = Image.Resampling.NEAREST
        tile = tile.resize(tile_size, resample)
    return tile


@lru_cache(maxsize=32)
def get_heatmap_overlay(slide_id: str, max_dim: int = 2048) -> tuple[Image.Image, float]:
    slide = get_slide(slide_id)
    coords = get_coords(slide_id)
    normalized = get_tumor_warning_scores(slide_id)
    patch_size, patch_level = get_patch_metadata(slide_id)
    patch_size_level0 = max(1, int(round(patch_size * float(slide.level_downsamples[patch_level]))))

    width, height = slide.dimensions
    scale = min(1.0, max_dim / max(width, height))
    canvas_w = max(1, int(width * scale))
    canvas_h = max(1, int(height * scale))
    patch_size_on_canvas = max(1, int(round(patch_size_level0 * scale)))

    score_map = np.zeros((canvas_h, canvas_w), dtype=np.float32)
    score_count = np.zeros((canvas_h, canvas_w), dtype=np.float32)

    for index, (x, y) in enumerate(coords):
        patch_score = float(normalized[index])
        if patch_score < HEATMAP_OVERLAY_SCORE_THRESHOLD:
            continue

        x_scaled = int(x * scale)
        y_scaled = int(y * scale)
        x_end = min(canvas_w, x_scaled + patch_size_on_canvas)
        y_end = min(canvas_h, y_scaled + patch_size_on_canvas)
        if x_end <= x_scaled or y_end <= y_scaled:
            continue

        score_map[y_scaled:y_end, x_scaled:x_end] = np.maximum(
            score_map[y_scaled:y_end, x_scaled:x_end],
            patch_score,
        )
        score_count[y_scaled:y_end, x_scaled:x_end] += 1.0

    valid_mask = score_count > 0
    return compose_heatmap_image(score_map, valid_mask, patch_size_on_canvas), float(scale)


@lru_cache(maxsize=32)
def build_heatmap(slide_id: str, max_dim: int = 2048) -> Image.Image:
    return get_heatmap_overlay(slide_id, max_dim)[0]


def command_list(_: argparse.Namespace) -> int:
    payload = [serialize_slide(path.stem) for path in iter_slides()]
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def command_detail(args: argparse.Namespace) -> int:
    try:
        payload = serialize_slide(args.slide_id)
    except FileNotFoundError as error:
        print(json.dumps({"detail": str(error)}, ensure_ascii=False))
        return 0

    print(json.dumps(payload, ensure_ascii=False))
    return 0


def command_render_thumbnail(args: argparse.Namespace) -> int:
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    build_thumbnail(args.slide_id).save(output_path, format="JPEG", quality=92)
    return 0


def command_render_heatmap(args: argparse.Namespace) -> int:
    if not has_inference_assets(args.slide_id):
        raise FileNotFoundError(f"Heatmap assets for '{args.slide_id}' not found")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    build_heatmap(args.slide_id).save(output_path, format="PNG")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pathology ML bridge")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list")
    list_parser.set_defaults(handler=command_list)

    detail_parser = subparsers.add_parser("detail")
    detail_parser.add_argument("--slide-id", required=True)
    detail_parser.set_defaults(handler=command_detail)

    thumbnail_parser = subparsers.add_parser("render-thumbnail")
    thumbnail_parser.add_argument("--slide-id", required=True)
    thumbnail_parser.add_argument("--output", required=True)
    thumbnail_parser.set_defaults(handler=command_render_thumbnail)

    heatmap_parser = subparsers.add_parser("render-heatmap")
    heatmap_parser.add_argument("--slide-id", required=True)
    heatmap_parser.add_argument("--output", required=True)
    heatmap_parser.set_defaults(handler=command_render_heatmap)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise