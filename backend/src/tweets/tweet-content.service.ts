import { Injectable, Logger } from '@nestjs/common';
import type { XNotificationWebhookDto } from './tweet-content.dto.js';
import {
  serializeTweetContent,
  type StoredTweetContent,
  type TweetContent,
  type TweetIngestionResult,
} from './tweet-content.model.js';
import { TweetContentRepository } from './tweet-content.repository.js';
import { XProfileService } from '../x-profiles/x-profile.service.js';

const allowedXHosts = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

interface TweetReference {
  authorHandle: string | null;
  tweetId: string;
}

@Injectable()
export class TweetContentService {
  private readonly logger = new Logger(TweetContentService.name);

  constructor(
    private readonly repository: TweetContentRepository,
    private readonly xProfileService: XProfileService,
  ) {}

  async ingest(
    userId: string,
    payload: XNotificationWebhookDto,
  ): Promise<TweetIngestionResult> {
    const text =
      this.nonEmpty(payload.data?.body) ?? this.nonEmpty(payload.body);
    const authorDisplayName =
      this.nonEmpty(payload.data?.title) ?? this.nonEmpty(payload.title);
    const uri = payload.data?.uri;
    const reference = uri ? this.parseTweetReference(uri) : undefined;

    if (!text || !authorDisplayName || !uri || !reference) {
      this.logger.warn(
        `Ignored X notification (text=${String(Boolean(text))}, title=${String(Boolean(authorDisplayName))}, uri=${String(Boolean(uri))}, tweetReference=${String(Boolean(reference))})`,
      );
      return { status: 'ignored', reason: 'not_a_tweet_notification' };
    }

    const tweet: TweetContent = {
      tweetId: reference.tweetId,
      text,
      authorDisplayName,
      authorHandle: reference.authorHandle,
      profileImageUrl: null,
      originalUrl: `https://x.com/i/web/status/${reference.tweetId}`,
      notificationType: this.nonEmpty(payload.data?.type) ?? null,
      sourceTag:
        this.nonEmpty(payload.data?.tag) ?? this.nonEmpty(payload.tag) ?? null,
      notifiedAt: this.parseTimestamp(payload.timestamp),
      receivedAt: new Date(),
    };

    const saved = await this.repository.save(
      userId,
      tweet,
      payload as Readonly<Record<string, unknown>>,
    );
    this.logger.log(
      saved.duplicate
        ? 'Duplicate X notification received'
        : 'X notification stored',
    );

    const profileImageUrl = await this.resolveProfileImageUrl(
      reference.authorHandle,
    );

    return {
      status: 'accepted',
      duplicate: saved.duplicate,
      tweet: serializeTweetContent({ ...saved.tweet, profileImageUrl }),
    };
  }

  async findLatest(userId: string, limit: number): Promise<StoredTweetContent[]> {
    const tweets = await this.repository.findLatest(userId, limit);
    return tweets.map((tweet) => serializeTweetContent(tweet));
  }

  private nonEmpty(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private async resolveProfileImageUrl(
    authorHandle: string | null,
  ): Promise<string | null> {
    if (!authorHandle) return null;

    try {
      const result = await this.xProfileService.getByUsername(authorHandle);
      return result.profile?.profileImageUrl ?? null;
    } catch (error) {
      // プロフィール取得は付加情報なので、失敗しても受信済みの通知を失わない。
      this.logger.warn(
        `Failed to resolve X profile image (error=${this.getErrorName(error)})`,
      );
      return null;
    }
  }

  private getErrorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UnknownError';
  }

  private parseTweetReference(uri: string): TweetReference | undefined {
    let url: URL;
    try {
      // XのWeb Pushはクリック先を絶対URLではなく相対パスで送ることがある。
      url = new URL(uri, 'https://x.com');
    } catch {
      return undefined;
    }

    if (
      url.protocol !== 'https:' ||
      !allowedXHosts.has(url.hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return undefined;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const statusIndex = segments.indexOf('status');
    const tweetId = statusIndex >= 0 ? segments[statusIndex + 1] : undefined;
    if (!tweetId || !/^\d{1,32}$/.test(tweetId)) {
      return undefined;
    }

    const firstSegment = segments[0];
    const authorHandle =
      statusIndex === 1 &&
      firstSegment !== 'i' &&
      /^[A-Za-z0-9_]{1,15}$/.test(firstSegment)
        ? firstSegment
        : null;
    return { authorHandle, tweetId };
  }

  private parseTimestamp(timestamp: number | undefined): Date | null {
    if (timestamp === undefined) return null;

    const milliseconds =
      timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return null;

    const earliestReasonableDate = Date.UTC(2006, 0, 1);
    const latestReasonableDate = Date.now() + 24 * 60 * 60 * 1000;
    return date.getTime() >= earliestReasonableDate &&
      date.getTime() <= latestReasonableDate
      ? date
      : null;
  }
}
