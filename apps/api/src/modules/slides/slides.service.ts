import { Injectable, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { SlideRecord } from './interfaces/slide.interface';
import { MlBridgeService } from './ml-bridge.service';

@Injectable()
export class SlidesService {
  constructor(private readonly mlBridgeService: MlBridgeService) {}

  private enrichSlide(slide: SlideRecord): SlideRecord {
    return {
      ...slide,
      thumbnail_url:
        slide.thumbnail_url && slide.thumbnail_url.length > 0
          ? slide.thumbnail_url
          : `${this.mlBridgeService.getBridgeUrl()}/slides/${encodeURIComponent(slide.id)}/assets/thumbnail`,
      ai_prediction_status: slide.ai_prediction_status ?? slide.status,
    };
  }

  async listSlides(): Promise<SlideRecord[]> {
    const slides = await this.mlBridgeService.getJson<SlideRecord[]>('/slides');
    return slides.map((slide) => this.enrichSlide(slide));
  }

  async getSlide(slideId: string): Promise<SlideRecord> {
    const slide = await this.mlBridgeService.getJson<SlideRecord | { detail: string }>(
      `/slides/${encodeURIComponent(slideId)}`,
    );

    if ('detail' in slide) {
      throw new NotFoundException(slide.detail);
    }

    return this.enrichSlide(slide);
  }

  async getThumbnailStream(slideId: string) {
    const buffer = await this.mlBridgeService.getBinary(`/slides/${encodeURIComponent(slideId)}/assets/thumbnail`);
    return Readable.from(buffer);
  }

  async getFocusRoiStream(slideId: string, x: number, y: number, width: number, height: number, maxDim: number) {
    const searchParams = new URLSearchParams({
      x: String(x),
      y: String(y),
      width: String(width),
      height: String(height),
      max_dim: String(maxDim),
    });
    const buffer = await this.mlBridgeService.getBinary(
      `/slides/${encodeURIComponent(slideId)}/focus-roi.jpg?${searchParams.toString()}`,
    );
    return Readable.from(buffer);
  }

  async getHeatmapStream(slideId: string) {
    const buffer = await this.mlBridgeService.getBinary(`/slides/${encodeURIComponent(slideId)}/assets/heatmap`);
    return Readable.from(buffer);
  }

  async getHeatmapDziStream(slideId: string) {
    const buffer = await this.mlBridgeService.getBinary(`/slides/${encodeURIComponent(slideId)}/heatmap.dzi`);
    return Readable.from(buffer);
  }

  async getHeatmapTileStream(slideId: string, level: number, column: number, row: number, format: string) {
    const buffer = await this.mlBridgeService.getBinary(
      `/slides/${encodeURIComponent(slideId)}/heatmap_files/${level}/${column}_${row}.${format}`,
    );
    return Readable.from(buffer);
  }

  async getWsiDziStream(slideId: string) {
    const buffer = await this.mlBridgeService.getBinary(`/slides/${encodeURIComponent(slideId)}/wsi.dzi`);
    return Readable.from(buffer);
  }

  async getWsiTileStream(slideId: string, level: number, column: number, row: number, format: string) {
    const normalizedFormat = format === 'jpg' ? 'jpeg' : format;
    const buffer = await this.mlBridgeService.getBinary(
      `/slides/${encodeURIComponent(slideId)}/wsi_files/${level}/${column}_${row}.${normalizedFormat}`,
    );
    return Readable.from(buffer);
  }
}