import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MlBridgeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MlBridgeService.name);

  constructor(private readonly configService: ConfigService) {}

  private get bridgeUrl() {
    return this.configService.get<string>('ML_BRIDGE_URL') ?? 'http://127.0.0.1:4100';
  }

  getBridgeUrl() {
    return this.bridgeUrl;
  }

  private get startupTimeoutMs() {
    const configured = this.configService.get<string>('ML_BRIDGE_STARTUP_TIMEOUT_MS');
    const parsed = configured ? Number.parseInt(configured, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  }

  async onApplicationBootstrap() {
    await this.waitForHealthy();
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.bridgeUrl}${path}`);
    if (!response.ok) {
      throw new InternalServerErrorException(await this.readError(response));
    }
    return (await response.json()) as T;
  }

  async getBinary(path: string): Promise<Buffer> {
    const response = await fetch(`${this.bridgeUrl}${path}`);
    if (!response.ok) {
      throw new InternalServerErrorException(await this.readError(response));
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async waitForHealthy() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.startupTimeoutMs) {
      if (await this.isHealthy()) {
        this.logger.log(`Connected to independent ML bridge at ${this.bridgeUrl}`);
      return;
    }

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }

    throw new InternalServerErrorException(
      `Independent ML bridge is not reachable at ${this.bridgeUrl} within ${this.startupTimeoutMs}ms`,
    );
  }

  private async isHealthy() {
    try {
      const response = await fetch(`${this.bridgeUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async readError(response: Response) {
    try {
      const payload = (await response.json()) as { detail?: string; message?: string };
      return payload.detail ?? payload.message ?? `ML bridge request failed with status ${response.status}`;
    } catch {
      return `ML bridge request failed with status ${response.status}`;
    }
  }
}