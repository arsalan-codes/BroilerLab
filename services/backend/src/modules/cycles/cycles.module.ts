import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cycle } from '../../domain/entities/cycle.entity';
import { Visit } from '../../domain/entities/visit.entity';
import { TelemetryRaw } from '../../domain/entities/telemetry.entity';
import { Registration } from '../../domain/entities/registration.entity';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cycle, Visit, TelemetryRaw, Registration]),
    TelemetryModule,
  ],
  controllers: [CyclesController],
  providers: [CyclesService],
  exports: [CyclesService],
})
export class CyclesModule {}
