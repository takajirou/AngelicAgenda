import type { TweetFilterSettings } from './tweet-filter.model.js';

export abstract class TweetFilterSettingsRepository {
  abstract find(userId: string): Promise<TweetFilterSettings | null>;
  abstract save(
    userId: string,
    settings: TweetFilterSettings,
  ): Promise<TweetFilterSettings>;
}
