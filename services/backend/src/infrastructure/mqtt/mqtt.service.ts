import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { ConfigService } from '@nestjs/config';
import { DevicesService } from '../../modules/devices/devices.service';
import { TelemetryService } from '../../modules/telemetry/telemetry.service';
import { Cycle } from '../../domain/entities/cycle.entity';

/**
 * MQTT v5 ingestion client (mqtt.js).
 * Subscribes to lab/dev/+/events (QoS 1). Each message is a JSON device batch.
 * Maps deviceUid -> owner via DevicesService, resolves the active cycle, and
 * pushes to TelemetryService (persists raw + derives visits + broadcasts WS).
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(
    private config: ConfigService,
    private devices: DevicesService,
    private telemetry: TelemetryService,
    @InjectRepository(Cycle) private cycles: Repository<Cycle>,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('MQTT_URL') || 'mqtt://127.0.0.1:1883';
    this.client = mqtt.connect(url, {
      username: this.config.get('MQTT_USERNAME') || undefined,
      password: this.config.get('MQTT_PASSWORD') || undefined,
      clean: true,
      protocolVersion: 5,
      reconnectPeriod: 3000,
    });

    this.client.on('connect', () => {
      this.logger.log('MQTT connected');
      this.client.subscribe('lab/dev/+/events', { qos: 1 });
    });
    this.client.on('message', (topic, payload) => this.handle(topic, payload.toString()));
    this.client.on('error', (e) => this.logger.error(`MQTT error: ${e.message}`));
  }

  private async handle(topic: string, payload: string) {
    try {
      const deviceUid = topic.split('/')[2];
      const device = await this.devices.upsert(deviceUid);
      const batch = JSON.parse(payload);
      const events = Array.isArray(batch) ? batch : batch.events || [batch];
      const cycleId = batch.cycle_id || (await this.resolveCycle(device.owner_id));
      if (!cycleId) {
        this.logger.warn(`No cycle for ${deviceUid}; drop ${events.length}`);
        return;
      }
      await this.telemetry.ingestBatch(
        { cycle_id: cycleId, device_id: deviceUid, events },
        { id: device.owner_id, email: '', role: 'researcher' },
      );
    } catch (e) {
      this.logger.error(`MQTT handle failed: ${(e as Error).message}`);
    }
  }

  private async resolveCycle(ownerId: string): Promise<string | null> {
    const c = await this.cycles.findOne({
      where: { owner_id: ownerId, active: true },
      order: { created_at: 'DESC' },
    });
    return c?.id ?? null;
  }

  onModuleDestroy() {
    this.client?.end(true);
  }
}
