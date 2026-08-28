import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WsGateway } from './ws.gateway';

@Module({
  imports: [EventEmitterModule],
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsGatewayModule {}
