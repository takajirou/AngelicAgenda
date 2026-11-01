import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
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
  original_url: string;
  notification_type: string | null;
  source_tag: string | null;
  notified_at: Date | null;
  received_at: Date;
}

@Injectable()
export class PostgresTweetContentRepository
  extends TweetContentRepository
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PostgresTweetContentRepository.name);
  private pool: Pool | undefined;

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });

    const client = await this.pool.connect();
    try {
      await this.initializeSchema(client);
    } finally {
      client.release();
    }
    this.logger.log('Tweet content repository is ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
  }

  async save(
    tweet: TweetContent,
    rawPayload: Readonly<Record<string, unknown>>,
  ): Promise<SaveTweetContentResult> {
    const result = await this.requirePool().query<TweetContentRow>(
      `
        INSERT INTO tweet_contents (
          tweet_id,
          text,
          author_display_name,
          author_handle,
          original_url,
          notification_type,
          source_tag,
          notified_at,
          received_at,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (tweet_id) DO NOTHING
        RETURNING
          tweet_id,
          text,
          author_display_name,
          author_handle,
          original_url,
          notification_type,
          source_tag,
          notified_at,
          received_at
      `,
      [
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
    if (inserted) {
      return { duplicate: false, tweet: this.mapRow(inserted) };
    }

    const existing = await this.requirePool().query<TweetContentRow>(
      `
        SELECT
          tweet_id,
          text,
          author_display_name,
          author_handle,
          original_url,
          notification_type,
          source_tag,
          notified_at,
          received_at
        FROM tweet_contents
        WHERE tweet_id = $1
      `,
      [tweet.tweetId],
    );
    const duplicate = existing.rows[0];
    if (!duplicate) {
      throw new Error('Tweet content disappeared after duplicate detection');
    }
    return { duplicate: true, tweet: this.mapRow(duplicate) };
  }

  async findLatest(limit: number): Promise<TweetContent[]> {
    const result = await this.requirePool().query<TweetContentRow>(
      `
        SELECT
          tweet_id,
          text,
          author_display_name,
          author_handle,
          original_url,
          notification_type,
          source_tag,
          notified_at,
          received_at
        FROM tweet_contents
        ORDER BY received_at DESC, tweet_id DESC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private requirePool(): Pool {
    if (!this.pool) {
      throw new Error('Tweet content repository is not initialized');
    }
    return this.pool;
  }

  private async initializeSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tweet_contents (
        tweet_id varchar(32) PRIMARY KEY,
        text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 10000),
        author_display_name varchar(512) NOT NULL,
        author_handle varchar(64),
        original_url varchar(2048) NOT NULL,
        notification_type varchar(64),
        source_tag varchar(512),
        notified_at timestamptz,
        received_at timestamptz NOT NULL,
        raw_payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (tweet_id ~ '^[0-9]{1,32}$')
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS tweet_contents_received_at_idx
      ON tweet_contents (received_at DESC)
    `);
  }

  private mapRow(row: TweetContentRow): TweetContent {
    return {
      tweetId: row.tweet_id,
      text: row.text,
      authorDisplayName: row.author_display_name,
      authorHandle: row.author_handle,
      originalUrl: row.original_url,
      notificationType: row.notification_type,
      sourceTag: row.source_tag,
      notifiedAt: row.notified_at,
      receivedAt: row.received_at,
    };
  }
}
