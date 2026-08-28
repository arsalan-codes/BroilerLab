import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cycle } from '../../domain/entities/cycle.entity';
import { MqttService } from './mqtt.service';
import { DevicesModule } from '../../modules/devices/devices.module';
import { TelemetryModule } from '../../modules/telemetry/telemetry.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cycle]), DevicesModule, TelemetryModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
