import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AngelicAngelService } from './../src/integrations/angelic-angel/angelic-angel.service.js';
import type { TweetContent } from './../src/tweets/tweet-content.model.js';
import { TweetContentRepository } from './../src/tweets/tweet-content.repository.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const provision = vi.fn();
  const saveTweet = vi.fn();
  const findLatestTweets = vi.fn();
  const setupToken = 's'.repeat(64);
  const originalSetupToken = process.env.ANGELIC_SETUP_TOKEN;
  const originalSetupTokenFile = process.env.ANGELIC_SETUP_TOKEN_FILE;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AngelicAngelService)
      .useValue({ provision })
      .overrideProvider(TweetContentRepository)
      .useValue({ save: saveTweet, findLatest: findLatestTweets })
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
    saveTweet.mockReset();
    findLatestTweets.mockReset();
    saveTweet.mockImplementation(async (tweet: TweetContent) => ({
      duplicate: false,
      tweet,
    }));
    findLatestTweets.mockResolvedValue([]);
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

  it('/webhooks/x extracts and stores tweet content', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/x')
      .send({
        title: '公式アカウント',
        body: '予約販売は11月1日までです',
        timestamp: 1_793_273_400_000,
        tag: 'tweet_123',
        data: {
          type: 'tweet',
          uri: 'https://x.com/official/status/123',
          title: '公式アカウント',
          body: '予約販売は11月1日までです',
          tag: 'tweet_123',
        },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'accepted',
          duplicate: false,
          tweet: {
            tweetId: '123',
            text: '予約販売は11月1日までです',
            authorHandle: 'official',
            originalUrl: 'https://x.com/i/web/status/123',
          },
        });
      });

    expect(saveTweet).toHaveBeenCalledOnce();
  });

  it('/webhooks/x rejects unknown payload fields', () => {
    return request(app.getHttpServer())
      .post('/webhooks/x')
      .send({
        title: '公式アカウント',
        body: '本文',
        data: { uri: 'https://x.com/official/status/123' },
        unexpected: 'value',
      })
      .expect(400);
  });

  it('/tweets requires authentication and returns saved content', async () => {
    findLatestTweets.mockResolvedValueOnce([
      {
        tweetId: '123',
        text: '本文',
        authorDisplayName: '公式アカウント',
        authorHandle: 'official',
        originalUrl: 'https://x.com/i/web/status/123',
        notificationType: 'tweet',
        sourceTag: 'tweet_123',
        notifiedAt: null,
        receivedAt: new Date('2026-10-29T12:00:00.000Z'),
      },
    ]);

    await request(app.getHttpServer()).get('/tweets').expect(401);
    await request(app.getHttpServer())
      .get('/tweets?limit=10')
      .set('Authorization', `Bearer ${setupToken}`)
      .expect(200)
      .expect([
        {
          tweetId: '123',
          text: '本文',
          authorDisplayName: '公式アカウント',
          authorHandle: 'official',
          originalUrl: 'https://x.com/i/web/status/123',
          notificationType: 'tweet',
          sourceTag: 'tweet_123',
          notifiedAt: null,
          receivedAt: '2026-10-29T12:00:00.000Z',
        },
      ]);
    expect(findLatestTweets).toHaveBeenCalledWith(10);
  });

  it('/tweets validates the result limit', () => {
    return request(app.getHttpServer())
      .get('/tweets?limit=101')
      .set('Authorization', `Bearer ${setupToken}`)
      .expect(400);
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
