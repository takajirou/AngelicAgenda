import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppAuthGuard, type AuthenticatedRequest } from '../src/auth/app-auth.guard.js';
import { AuthService } from '../src/auth/auth.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AngelicAngelService } from '../src/integrations/angelic-angel/angelic-angel.service.js';
import { AppModule } from '../src/app.module.js';
import type { TweetContent } from '../src/tweets/tweet-content.model.js';
import { TweetContentRepository } from '../src/tweets/tweet-content.repository.js';
import { XProfileService } from '../src/x-profiles/x-profile.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
  };
  const authToken = 'test-session-token';
  const provision = vi.fn();
  const disconnect = vi.fn();
  const verifyWebhookRoute = vi.fn();
  const saveTweet = vi.fn();
  const findLatestTweets = vi.fn();
  const getXProfile = vi.fn();
  const authSession = {
    token: authToken,
    expiresAt: '2026-12-01T00:00:00.000Z',
    user,
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        register: vi.fn(async () => authSession),
        login: vi.fn(async () => authSession),
        logout: vi.fn(),
        deleteAccount: vi.fn(),
      })
      .overrideGuard(AppAuthGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
          const incoming = context.switchToHttp().getRequest();
          if (incoming.header('authorization') !== `Bearer ${authToken}`) {
            throw new UnauthorizedException();
          }
          incoming.appUser = user;
          incoming.appSessionToken = authToken;
          return true;
        },
      })
      .overrideProvider(AngelicAngelService)
      .useValue({
        provision,
        disconnect,
        isConnected: vi.fn(async () => true),
        verifyWebhookRoute,
      })
      .overrideProvider(TweetContentRepository)
      .useValue({ save: saveTweet, findLatest: findLatestTweets })
      .overrideProvider(XProfileService)
      .useValue({ getByUsername: getXProfile })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    provision.mockReset();
    disconnect.mockReset();
    verifyWebhookRoute.mockReset();
    saveTweet.mockReset();
    findLatestTweets.mockReset();
    getXProfile.mockReset();
    saveTweet.mockImplementation(async (_userId: string, tweet: TweetContent) => ({
      duplicate: false,
      tweet,
    }));
    findLatestTweets.mockResolvedValue([]);
    getXProfile.mockResolvedValue({
      status: 'cached',
      profile: {
        xUserId: '987654321',
        username: 'official',
        displayName: '公式アカウント',
        profileImageUrl:
          'https://pbs.twimg.com/profile_images/987654321/icon_normal.jpg',
        fetchedAt: new Date('2026-10-29T12:00:00.000Z'),
      },
    });
    await app.init();
  });

  it('/health (GET)', () =>
    request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' }));

  it('/auth/register creates an app session', () =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: user.email, password: 'password-1234' })
      .expect(201)
      .expect(authSession));

  it('/auth/register validates credentials', () =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'invalid', password: 'short' })
      .expect(400));

  it('/auth/register rate limits repeated attempts', async () => {
    const credentials = { email: user.email, password: 'password-1234' };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(429);
  });

  it('/integrations/angelic-angel/session requires an app session', () =>
    request(app.getHttpServer())
      .post('/integrations/angelic-angel/session')
      .send({ authToken: 'a'.repeat(32), ct0: 'b'.repeat(32) })
      .expect(401));

  it('/integrations/angelic-angel/session provisions only the current user', async () => {
    const credentials = { authToken: 'a'.repeat(32), ct0: 'b'.repeat(32) };
    await request(app.getHttpServer())
      .post('/integrations/angelic-angel/session')
      .set('Authorization', `Bearer ${authToken}`)
      .send(credentials)
      .expect(200)
      .expect({ status: 'registered' });
    expect(provision).toHaveBeenCalledWith(user.id, credentials);
  });

  it('/webhooks/x routes content to the signed user', async () => {
    const signature = 'signed-route';
    await request(app.getHttpServer())
      .post(`/webhooks/x/${user.id}/${signature}`)
      .send({
        title: '公式アカウント',
        body: '予約販売は11月1日までです',
        data: { type: 'tweet', uri: 'https://x.com/official/status/123' },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'accepted',
          tweet: {
            tweetId: '123',
            profileImageUrl:
              'https://pbs.twimg.com/profile_images/987654321/icon_normal.jpg',
          },
        });
      });
    expect(verifyWebhookRoute).toHaveBeenCalledWith(user.id, signature);
    expect(saveTweet).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ tweetId: '123' }),
      expect.any(Object),
    );
  });

  it('/tweets returns only the current user content', async () => {
    findLatestTweets.mockResolvedValueOnce([
      {
        tweetId: '123',
        text: '本文',
        authorDisplayName: '公式',
        authorHandle: 'official',
        profileImageUrl:
          'https://pbs.twimg.com/profile_images/987654321/icon_normal.jpg',
        originalUrl: 'https://x.com/i/web/status/123',
        notificationType: 'tweet',
        sourceTag: null,
        notifiedAt: null,
        receivedAt: new Date('2026-10-29T12:00:00.000Z'),
      },
    ]);
    await request(app.getHttpServer())
      .get('/tweets?limit=10')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(findLatestTweets).toHaveBeenCalledWith(user.id, 10);
  });

  afterEach(async () => app.close());
});
