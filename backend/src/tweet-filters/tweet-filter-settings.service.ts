import { Injectable } from '@nestjs/common';
import type { UpdateTweetFilterSettingsDto } from './tweet-filter-settings.dto.js';
import {
  tweetFilterCategories,
  type TweetFilterSettings,
} from './tweet-filter.model.js';
import { TweetFilterSettingsRepository } from './tweet-filter-settings.repository.js';

@Injectable()
export class TweetFilterSettingsService {
  constructor(private readonly repository: TweetFilterSettingsRepository) {}

  async get(userId: string): Promise<TweetFilterSettings> {
    return (await this.repository.find(userId)) ?? this.defaultSettings();
  }

  findConfigured(userId: string): Promise<TweetFilterSettings | null> {
    return this.repository.find(userId);
  }

  save(
    userId: string,
    settings: UpdateTweetFilterSettingsDto,
  ): Promise<TweetFilterSettings> {
    return this.repository.save(userId, {
      filteringEnabled: settings.filteringEnabled,
      categories: [...settings.categories],
    });
  }

  private defaultSettings(): TweetFilterSettings {
    return {
      filteringEnabled: false,
      categories: [...tweetFilterCategories],
    };
  }
}
