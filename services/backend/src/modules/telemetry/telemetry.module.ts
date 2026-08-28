import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryRaw } from '../../domain/entities/telemetry.entity';
import { Visit } from '../../domain/entities/visit.entity';
import { Cycle } from '../../domain/entities/cycle.entity';
import { Device } from '../../domain/entities/device.entity';
import { Registration } from '../../domain/entities/registration.entity';
import { TelemetryService } from './telemetry.service';
import { VisitProcessor } from './visit-processor';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelemetryRaw, Visit, Cycle, Device, Registration]),
    DevicesModule,
  ],
  controllers: [],
  providers: [TelemetryService, VisitProcessor],
  exports: [TelemetryService],
})
export class TelemetryModule {}
