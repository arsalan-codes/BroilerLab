import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../../domain/entities/device.entity';
import { User } from '../../domain/entities/user.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device) private devices: Repository<Device>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /** Find or provision a device from an MQTT client id (device_uid). */
  async upsert(deviceUid: string, label: string | undefined, ownerId?: string): Promise<Device> {
    let d = await this.devices.findOne({ where: { device_uid: deviceUid } });
    if (!d) {
      d = this.devices.create({
        owner_id: ownerId ?? '00000000-0000-0000-0000-000000000000',
        device_uid: deviceUid,
        label: label ?? deviceUid,
        last_seen: new Date(),
      });
      d = await this.devices.save(d);
    } else {
      d.last_seen = new Date();
      await this.devices.save(d);
    }
    return d;
  }
}
