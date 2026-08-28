import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../../domain/entities/device.entity';
import { User } from '../../domain/entities/user.entity';
import { DevicesService } from './devices.service';

@Module({
  imports: [TypeOrmModule.forFeature([Device, User])],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
