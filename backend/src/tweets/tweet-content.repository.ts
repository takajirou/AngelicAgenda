import type { TweetContent } from './tweet-content.model.js';

export interface SaveTweetContentResult {
  duplicate: boolean;
  tweet: TweetContent;
}

export abstract class TweetContentRepository {
  abstract save(
    tweet: TweetContent,
    rawPayload: Readonly<Record<string, unknown>>,
  ): Promise<SaveTweetContentResult>;

  abstract findLatest(limit: number): Promise<TweetContent[]>;
}
