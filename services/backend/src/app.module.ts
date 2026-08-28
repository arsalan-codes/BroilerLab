import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { Cycle } from './domain/entities/cycle.entity';
import { TelemetryRaw } from './domain/entities/telemetry.entity';
import { Visit } from './domain/entities/visit.entity';
import { Registration } from './domain/entities/registration.entity';
import { User } from './domain/entities/user.entity';
import { Device } from './domain/entities/device.entity';
import { AuthModule } from './modules/auth/auth.module';
import { CyclesModule } from './modules/cycles/cycles.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { DevicesModule } from './modules/devices/devices.module';
import { WsGatewayModule } from './modules/ws-gateway/ws-gateway.module';
import { MqttModule } from './infrastructure/mqtt/mqtt.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '.env.local'],
    }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Cycle, TelemetryRaw, Visit, Registration, User, Device],
      synchronize: false, // dbmate owns schema
      logging: false,
    }),
    AuthModule,
    CyclesModule,
    TelemetryModule,
    DevicesModule,
    WsGatewayModule,
    MqttModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
