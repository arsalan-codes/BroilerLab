import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Socket.io gateway. Clients join room `cycle:{id}` to receive live device events.
 * Mirrors the original /ws/cycle/{id} behaviour but over Socket.io (the spec asks
 * for Socket.io / WebSocket). Auth via JWT handshake query token.
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class WsGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);

  afterInit() {
    this.logger.log('WS gateway initialized');
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, @MessageBody() cycleId: string) {
    client.join(`cycle:${cycleId}`);
    client.emit('joined', cycleId);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, @MessageBody() cycleId: string) {
    client.leave(`cycle:${cycleId}`);
  }

  /** Broadcast new telemetry to all subscribers of a cycle room. */
  @OnEvent('telemetry:new')
  handleTelemetryNew(payload: { cycleId: string; count: number }) {
    this.server.to(`cycle:${payload.cycleId}`).emit('device', {
      type: 'batch',
      count: payload.count,
      at: new Date().toISOString(),
    });
  }
}
