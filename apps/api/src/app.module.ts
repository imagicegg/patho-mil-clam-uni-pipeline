import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { HealthModule } from './modules/health/health.module';
import { SlidesModule } from './modules/slides/slides.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(__dirname, '../.env.local'), resolve(__dirname, '../.env')],
    }),
    HealthModule,
    SlidesModule,
  ],
})
export class AppModule {}