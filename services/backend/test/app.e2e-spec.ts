import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts setup (global prefix).
    app.setGlobalPrefix((process.env.API_PREFIX || '/api/v1').replace(/^\//, ''));
    await app.init();
  });

  it('/api/v1/health (GET) returns ok', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        if (res.body?.status !== 'ok') {
          throw new Error(`Unexpected health payload: ${JSON.stringify(res.body)}`);
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
