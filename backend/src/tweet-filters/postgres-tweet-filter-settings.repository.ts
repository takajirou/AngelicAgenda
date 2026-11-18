import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type {
  TweetFilterCategory,
  TweetFilterSettings,
} from './tweet-filter.model.js';
import { TweetFilterSettingsRepository } from './tweet-filter-settings.repository.js';

interface TweetFilterSettingsRow {
  filtering_enabled: boolean;
  categories: TweetFilterCategory[];
}

@Injectable()
export class PostgresTweetFilterSettingsRepository extends TweetFilterSettingsRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async find(userId: string): Promise<TweetFilterSettings | null> {
    const result = await this.database.query<TweetFilterSettingsRow>(
      `SELECT filtering_enabled, categories
       FROM user_tweet_filter_settings
       WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async save(
    userId: string,
    settings: TweetFilterSettings,
  ): Promise<TweetFilterSettings> {
    const result = await this.database.query<TweetFilterSettingsRow>(
      `INSERT INTO user_tweet_filter_settings (
         user_id, filtering_enabled, categories, updated_at
       ) VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET
         filtering_enabled = EXCLUDED.filtering_enabled,
         categories = EXCLUDED.categories,
         updated_at = now()
       RETURNING filtering_enabled, categories`,
      [userId, settings.filteringEnabled, settings.categories],
    );
    const saved = result.rows[0];
    if (!saved) throw new Error('Tweet filter settings were not saved');
    return this.mapRow(saved);
  }

  private mapRow(row: TweetFilterSettingsRow): TweetFilterSettings {
    return {
      filteringEnabled: row.filtering_enabled,
      categories: row.categories,
    };
  }
}
