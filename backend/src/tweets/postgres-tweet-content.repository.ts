import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { TweetContent } from './tweet-content.model.js';
import {
  TweetContentRepository,
  type SaveTweetContentResult,
} from './tweet-content.repository.js';

interface TweetContentRow {
  tweet_id: string;
  text: string;
  author_display_name: string;
  author_handle: string | null;
  profile_image_url: string | null;
  original_url: string;
  notification_type: string | null;
  source_tag: string | null;
  notified_at: Date | null;
  received_at: Date;
}

@Injectable()
export class PostgresTweetContentRepository extends TweetContentRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save(
    userId: string,
    tweet: TweetContent,
    rawPayload: Readonly<Record<string, unknown>>,
  ): Promise<SaveTweetContentResult> {
    const result = await this.database.query<TweetContentRow>(
      `INSERT INTO user_tweet_contents (
         user_id, tweet_id, text, author_display_name, author_handle,
         original_url, notification_type, source_tag, notified_at,
         received_at, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (user_id, tweet_id) DO NOTHING
       RETURNING tweet_id, text, author_display_name, author_handle,
         NULL::varchar AS profile_image_url, original_url, notification_type,
         source_tag, notified_at, received_at`,
      [
        userId,
        tweet.tweetId,
        tweet.text,
        tweet.authorDisplayName,
        tweet.authorHandle,
        tweet.originalUrl,
        tweet.notificationType,
        tweet.sourceTag,
        tweet.notifiedAt,
        tweet.receivedAt,
        JSON.stringify(rawPayload),
      ],
    );
    const inserted = result.rows[0];
    if (inserted) return { duplicate: false, tweet: this.mapRow(inserted) };

    const existing = await this.database.query<TweetContentRow>(
      `SELECT t.tweet_id, t.text, t.author_display_name, t.author_handle,
         profile.profile_image_url, t.original_url, t.notification_type,
         t.source_tag, t.notified_at, t.received_at
       FROM user_tweet_contents t
       LEFT JOIN LATERAL (
         SELECT p.profile_image_url
         FROM x_user_profiles p
         WHERE lower(p.username) = lower(t.author_handle)
         ORDER BY p.fetched_at DESC
         LIMIT 1
       ) profile ON true
       WHERE t.user_id = $1 AND t.tweet_id = $2`,
      [userId, tweet.tweetId],
    );
    const duplicate = existing.rows[0];
    if (!duplicate) throw new Error('Tweet content disappeared after duplicate detection');
    return { duplicate: true, tweet: this.mapRow(duplicate) };
  }

  async findLatest(userId: string, limit: number): Promise<TweetContent[]> {
    const result = await this.database.query<TweetContentRow>(
      `SELECT t.tweet_id, t.text, t.author_display_name, t.author_handle,
         profile.profile_image_url, t.original_url, t.notification_type,
         t.source_tag, t.notified_at, t.received_at
       FROM user_tweet_contents t
       LEFT JOIN LATERAL (
         SELECT p.profile_image_url
         FROM x_user_profiles p
         WHERE lower(p.username) = lower(t.author_handle)
         ORDER BY p.fetched_at DESC
         LIMIT 1
       ) profile ON true
       WHERE t.user_id = $1
       ORDER BY t.received_at DESC, t.tweet_id DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: TweetContentRow): TweetContent {
    return {
      tweetId: row.tweet_id,
      text: row.text,
      authorDisplayName: row.author_display_name,
      authorHandle: row.author_handle,
      profileImageUrl: row.profile_image_url,
      originalUrl: row.original_url,
      notificationType: row.notification_type,
      sourceTag: row.source_tag,
      notifiedAt: row.notified_at,
      receivedAt: row.received_at,
    };
  }
}
