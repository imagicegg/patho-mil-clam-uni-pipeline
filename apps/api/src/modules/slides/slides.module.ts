import { Module } from '@nestjs/common';
import { SlidesController } from './slides.controller';
import { MlBridgeService } from './ml-bridge.service';
import { SlidesService } from './slides.service';

@Module({
  controllers: [SlidesController],
  providers: [MlBridgeService, SlidesService],
  exports: [SlidesService],
})
export class SlidesModule {}