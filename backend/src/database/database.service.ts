import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | undefined;

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');

    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.initializeSchema(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    this.logger.log('Database schema is ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
  }

  query<Row extends QueryResultRow>(text: string, values: unknown[] = []) {
    return this.requirePool().query<Row>(text, values);
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error('Database is not initialized');
    return this.pool;
  }

  private async initializeSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id uuid PRIMARY KEY,
        email varchar(254) NOT NULL UNIQUE,
        password_salt bytea NOT NULL,
        password_hash bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_auth_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        token_hash bytea NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS app_auth_sessions_user_idx
      ON app_auth_sessions (user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS app_auth_sessions_expiry_idx
      ON app_auth_sessions (expires_at)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_x_sessions (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        encrypted_config text NOT NULL,
        connected_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tweet_contents (
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        tweet_id varchar(32) NOT NULL,
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
        PRIMARY KEY (user_id, tweet_id),
        CHECK (tweet_id ~ '^[0-9]{1,32}$')
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_tweet_contents_latest_idx
      ON user_tweet_contents (user_id, received_at DESC, tweet_id DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS x_user_profiles (
        x_user_id varchar(32) PRIMARY KEY,
        username varchar(15) NOT NULL,
        display_name varchar(512) NOT NULL,
        profile_image_url varchar(2048),
        fetched_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
