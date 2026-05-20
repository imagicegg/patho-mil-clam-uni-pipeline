from __future__ import annotations

import argparse
import io

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response

from slide_bridge import (
    build_focus_roi_thumbnail,
    build_heatmap,
    build_thumbnail,
    get_heatmap_dzi,
    get_heatmap_tile,
    get_slide_dzi,
    get_slide_tile,
    iter_slides,
    serialize_slide,
)


app = FastAPI(title="Pathology ML Bridge", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "pathology-ml-bridge"}


@app.get("/slides")
def list_slides() -> JSONResponse:
    return JSONResponse([serialize_slide(path.stem) for path in iter_slides()])


@app.get("/slides/{slide_id}")
def get_slide(slide_id: str) -> JSONResponse:
    try:
        return JSONResponse(serialize_slide(slide_id))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/slides/{slide_id}/assets/thumbnail")
def get_thumbnail(slide_id: str) -> Response:
    try:
        image = build_thumbnail(slide_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=92)
    return Response(content=buffer.getvalue(), media_type="image/jpeg")


@app.get("/slides/{slide_id}/focus-roi.jpg")
def get_focus_roi_thumbnail(
    slide_id: str,
    x: int,
    y: int,
    width: int,
    height: int,
    max_dim: int = 224,
) -> Response:
    try:
        image = build_focus_roi_thumbnail(slide_id, x, y, width, height, max_dim=max_dim)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return Response(content=buffer.getvalue(), media_type="image/jpeg")


@app.get("/slides/{slide_id}/assets/heatmap")
def get_heatmap(slide_id: str) -> Response:
    try:
        image = build_heatmap(slide_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")


@app.get("/slides/{slide_id}/heatmap.dzi")
def get_heatmap_dzi_descriptor(slide_id: str) -> Response:
    try:
        payload = get_heatmap_dzi(slide_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return Response(content=payload, media_type="application/xml")


@app.get("/slides/{slide_id}/heatmap_files/{level}/{column}_{row}.{image_format}")
def get_heatmap_tile_image(
    slide_id: str,
    level: int,
    column: int,
    row: int,
    image_format: str,
) -> Response:
    if image_format != "png":
        raise HTTPException(status_code=400, detail=f"Unsupported tile format '{image_format}'")

    try:
        image = get_heatmap_tile(slide_id, level, column, row)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")


@app.get("/slides/{slide_id}/wsi.dzi")
def get_wsi_dzi(slide_id: str) -> Response:
    try:
        payload = get_slide_dzi(slide_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return Response(content=payload, media_type="application/xml")


@app.get("/slides/{slide_id}/wsi_files/{level}/{column}_{row}.{image_format}")
def get_wsi_tile(slide_id: str, level: int, column: int, row: int, image_format: str) -> Response:
    if image_format not in {"jpeg", "jpg"}:
        raise HTTPException(status_code=400, detail=f"Unsupported tile format '{image_format}'")

    try:
        image = get_slide_tile(slide_id, level, column, row)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return Response(content=buffer.getvalue(), media_type="image/jpeg")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the resident Pathology ML bridge service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4100)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())