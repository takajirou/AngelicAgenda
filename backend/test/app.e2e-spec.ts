import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AngelicAngelService } from './../src/integrations/angelic-angel/angelic-angel.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const provision = vi.fn();
  const setupToken = 's'.repeat(64);
  const originalSetupToken = process.env.ANGELIC_SETUP_TOKEN;
  const originalSetupTokenFile = process.env.ANGELIC_SETUP_TOKEN_FILE;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AngelicAngelService)
      .useValue({ provision })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    process.env.ANGELIC_SETUP_TOKEN = setupToken;
    provision.mockReset();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/integrations/angelic-angel/session rejects a missing setup token', () => {
    return request(app.getHttpServer())
      .post('/integrations/angelic-angel/session')
      .send({ authToken: 'a'.repeat(32), ct0: 'b'.repeat(32) })
      .expect(401);
  });

  it('/integrations/angelic-angel/session validates cookie input', () => {
    return request(app.getHttpServer())
      .post('/integrations/angelic-angel/session')
      .set('Authorization', `Bearer ${setupToken}`)
      .send({ authToken: 'short', ct0: 'b'.repeat(32) })
      .expect(400);
  });

  it('/integrations/angelic-angel/session provisions a valid session', async () => {
    await request(app.getHttpServer())
      .post('/integrations/angelic-angel/session')
      .set('Authorization', `Bearer ${setupToken}`)
      .send({ authToken: 'a'.repeat(32), ct0: 'b'.repeat(32) })
      .expect(200)
      .expect({ status: 'registered' });

    expect(provision).toHaveBeenCalledWith({
      authToken: 'a'.repeat(32),
      ct0: 'b'.repeat(32),
    });
  });

  it('/integrations/angelic-angel/session reads a Docker secret file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angelic-secret-test-'));
    const tokenFile = join(directory, 'setup-token');
    await writeFile(tokenFile, `${setupToken}\n`, { mode: 0o600 });
    delete process.env.ANGELIC_SETUP_TOKEN;
    process.env.ANGELIC_SETUP_TOKEN_FILE = tokenFile;

    try {
      await request(app.getHttpServer())
        .post('/integrations/angelic-angel/session')
        .set('Authorization', `Bearer ${setupToken}`)
        .send({ authToken: 'a'.repeat(32), ct0: 'b'.repeat(32) })
        .expect(200);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    await app.close();
    if (originalSetupToken === undefined) {
      delete process.env.ANGELIC_SETUP_TOKEN;
    } else {
      process.env.ANGELIC_SETUP_TOKEN = originalSetupToken;
    }
    if (originalSetupTokenFile === undefined) {
      delete process.env.ANGELIC_SETUP_TOKEN_FILE;
    } else {
      process.env.ANGELIC_SETUP_TOKEN_FILE = originalSetupTokenFile;
    }
  });
});
