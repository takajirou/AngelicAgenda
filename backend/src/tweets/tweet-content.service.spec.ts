import type { XNotificationWebhookDto } from './tweet-content.dto.js';
import type { TweetContent } from './tweet-content.model.js';
import { TweetContentRepository } from './tweet-content.repository.js';
import { TweetContentService } from './tweet-content.service.js';

class FakeTweetContentRepository extends TweetContentRepository {
  readonly save = vi.fn(
    async (
      tweet: TweetContent,
      _rawPayload: Readonly<Record<string, unknown>>,
    ) => ({ duplicate: false, tweet }),
  );
  readonly findLatest = vi.fn(async (_limit: number) => [] as TweetContent[]);
}

describe('TweetContentService', () => {
  let repository: FakeTweetContentRepository;
  let service: TweetContentService;

  beforeEach(() => {
    repository = new FakeTweetContentRepository();
    service = new TweetContentService(repository);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('extracts tweet text and metadata from a notification', async () => {
    const payload: XNotificationWebhookDto = {
      title: 'fallback title',
      body: 'fallback body',
      timestamp: 1_793_273_400_000,
      tag: 'tweet_1234567890123456789',
      data: {
        type: 'tweet',
        uri: 'https://x.com/officialacct/status/1234567890123456789?ref=push',
        title: '公式アカウント',
        body: '  先行抽選は11月1日までです。  ',
      },
    };

    const result = await service.ingest(payload);

    expect(result).toEqual({
      status: 'accepted',
      duplicate: false,
      tweet: {
        tweetId: '1234567890123456789',
        text: '先行抽選は11月1日までです。',
        authorDisplayName: '公式アカウント',
        authorHandle: 'officialacct',
        originalUrl: 'https://x.com/i/web/status/1234567890123456789',
        notificationType: 'tweet',
        sourceTag: 'tweet_1234567890123456789',
        notifiedAt: '2026-10-29T11:30:00.000Z',
        receivedAt: '2026-10-29T12:00:00.000Z',
      },
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tweetId: '1234567890123456789' }),
      payload,
    );
  });

  it('uses top-level text and handles the generic status URL', async () => {
    const result = await service.ingest({
      title: '@official',
      body: '予約販売を開始しました',
      timestamp: 1_793_273_400,
      data: {
        uri: 'https://twitter.com/i/web/status/20',
      },
    });

    expect(result).toMatchObject({
      status: 'accepted',
      tweet: {
        tweetId: '20',
        text: '予約販売を開始しました',
        authorHandle: null,
        notifiedAt: '2026-10-29T11:30:00.000Z',
      },
    });
  });

  it('accepts the relative status path used by X Web Push', async () => {
    const result = await service.ingest({
      title: '公式アカウント',
      body: 'ライブ先行受付を開始しました',
      data: {
        uri: '/official/status/1234567890123456789',
      },
    });

    expect(result).toMatchObject({
      status: 'accepted',
      tweet: {
        tweetId: '1234567890123456789',
        authorHandle: 'official',
        originalUrl: 'https://x.com/i/web/status/1234567890123456789',
      },
    });
  });

  it('falls back to top-level values when nested strings are empty', async () => {
    const result = await service.ingest({
      title: '公式',
      body: '受付中です',
      tag: 'tweet_21',
      data: {
        uri: 'https://x.com/official/status/21',
        title: '  ',
        body: '',
        tag: '',
      },
    });

    expect(result).toMatchObject({
      status: 'accepted',
      tweet: {
        text: '受付中です',
        authorDisplayName: '公式',
        sourceTag: 'tweet_21',
      },
    });
  });

  it.each([
    {
      title: '公式',
      body: '本文',
      data: { uri: 'https://example.com/user/status/123' },
    },
    {
      title: '公式',
      data: { uri: 'https://x.com/user/status/123' },
    },
    {
      title: '公式',
      body: '本文',
      data: { uri: 'https://x.com/settings/notifications' },
    },
  ] satisfies XNotificationWebhookDto[])(
    'ignores a payload that does not contain tweet content',
    async (payload) => {
      await expect(service.ingest(payload)).resolves.toEqual({
        status: 'ignored',
        reason: 'not_a_tweet_notification',
      });
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('returns the stored row when the notification is a duplicate', async () => {
    repository.save.mockImplementationOnce(async (tweet) => ({
      duplicate: true,
      tweet: { ...tweet, text: '最初に保存した本文' },
    }));

    const result = await service.ingest({
      title: '公式',
      body: '再送された本文',
      data: { uri: 'https://x.com/official/status/123' },
    });

    expect(result).toMatchObject({
      status: 'accepted',
      duplicate: true,
      tweet: { text: '最初に保存した本文' },
    });
  });

  it('serializes dates when listing saved tweets', async () => {
    repository.findLatest.mockResolvedValueOnce([
      {
        tweetId: '123',
        text: '本文',
        authorDisplayName: '公式',
        authorHandle: 'official',
        originalUrl: 'https://x.com/i/web/status/123',
        notificationType: 'tweet',
        sourceTag: null,
        notifiedAt: null,
        receivedAt: new Date('2026-10-29T10:00:00.000Z'),
      },
    ]);

    await expect(service.findLatest(10)).resolves.toEqual([
      expect.objectContaining({
        tweetId: '123',
        notifiedAt: null,
        receivedAt: '2026-10-29T10:00:00.000Z',
      }),
    ]);
    expect(repository.findLatest).toHaveBeenCalledWith(10);
  });
});
