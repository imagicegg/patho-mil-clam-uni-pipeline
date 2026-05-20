import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe, StreamableFile } from '@nestjs/common';
import { SlidesService } from './slides.service';

@Controller('slides')
export class SlidesController {
  constructor(private readonly slidesService: SlidesService) {}

  @Get()
  async listSlides() {
    return this.slidesService.listSlides();
  }

  @Get(':slideId')
  async getSlide(@Param('slideId') slideId: string) {
    return this.slidesService.getSlide(slideId);
  }

  @Get(':slideId/assets/thumbnail')
  @Header('Content-Type', 'image/jpeg')
  async getThumbnail(@Param('slideId') slideId: string) {
    return new StreamableFile(await this.slidesService.getThumbnailStream(slideId));
  }

  @Get(':slideId/assets/focus-roi/:x/:y/:width/:height.jpg')
  @Header('Content-Type', 'image/jpeg')
  async getFocusRoi(
    @Param('slideId') slideId: string,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Param('width', ParseIntPipe) width: number,
    @Param('height', ParseIntPipe) height: number,
  ) {
    return new StreamableFile(await this.slidesService.getFocusRoiStream(slideId, x, y, width, height, 224));
  }

  @Get(':slideId/assets/heatmap')
  @Header('Content-Type', 'image/png')
  async getHeatmap(@Param('slideId') slideId: string) {
    return new StreamableFile(await this.slidesService.getHeatmapStream(slideId));
  }

  @Get(':slideId/heatmap.dzi')
  @Header('Content-Type', 'application/xml')
  async getHeatmapDzi(@Param('slideId') slideId: string) {
    return new StreamableFile(await this.slidesService.getHeatmapDziStream(slideId));
  }

  @Get(':slideId/ai-heatmap.dzi')
  @Header('Content-Type', 'application/xml')
  async getAiHeatmapDzi(@Param('slideId') slideId: string) {
    return new StreamableFile(await this.slidesService.getHeatmapDziStream(slideId));
  }

  @Get(':slideId/heatmap_files/:level/:tileId')
  async getHeatmapTile(
    @Param('slideId') slideId: string,
    @Param('level', ParseIntPipe) level: number,
    @Param('tileId') tileId: string,
  ) {
    const match = /^(\d+)_(\d+)\.(png)$/i.exec(tileId);
    if (!match) {
      throw new NotFoundException(`Invalid tile identifier '${tileId}'`);
    }

    const [, columnText, rowText, format] = match;
    const column = Number.parseInt(columnText, 10);
    const row = Number.parseInt(rowText, 10);

    return new StreamableFile(await this.slidesService.getHeatmapTileStream(slideId, level, column, row, format), {
      type: 'image/png',
    });
  }

  @Get(':slideId/ai-heatmap_files/:level/:tileId')
  async getAiHeatmapTile(
    @Param('slideId') slideId: string,
    @Param('level', ParseIntPipe) level: number,
    @Param('tileId') tileId: string,
  ) {
    const match = /^(\d+)_(\d+)\.(png)$/i.exec(tileId);
    if (!match) {
      throw new NotFoundException(`Invalid tile identifier '${tileId}'`);
    }

    const [, columnText, rowText, format] = match;
    const column = Number.parseInt(columnText, 10);
    const row = Number.parseInt(rowText, 10);

    return new StreamableFile(await this.slidesService.getHeatmapTileStream(slideId, level, column, row, format), {
      type: 'image/png',
    });
  }

  @Get(':slideId/wsi.dzi')
  @Header('Content-Type', 'application/xml')
  async getWsiDzi(@Param('slideId') slideId: string) {
    return new StreamableFile(await this.slidesService.getWsiDziStream(slideId));
  }

  @Get(':slideId/wsi_files/:level/:tileId')
  async getWsiTile(
    @Param('slideId') slideId: string,
    @Param('level', ParseIntPipe) level: number,
    @Param('tileId') tileId: string,
  ) {
    const match = /^(\d+)_(\d+)\.(jpeg|jpg|png)$/i.exec(tileId);
    if (!match) {
      throw new NotFoundException(`Invalid tile identifier '${tileId}'`);
    }

    const [, columnText, rowText, format] = match;
    const column = Number.parseInt(columnText, 10);
    const row = Number.parseInt(rowText, 10);

    return new StreamableFile(await this.slidesService.getWsiTileStream(slideId, level, column, row, format), {
      type: format === 'png' ? 'image/png' : 'image/jpeg',
    });
  }
}