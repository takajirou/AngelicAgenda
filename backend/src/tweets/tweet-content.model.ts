export interface TweetContent {
  tweetId: string;
  text: string;
  authorDisplayName: string;
  authorHandle: string | null;
  profileImageUrl: string | null;
  originalUrl: string;
  notificationType: string | null;
  sourceTag: string | null;
  notifiedAt: Date | null;
  receivedAt: Date;
}

export interface StoredTweetContent extends Omit<
  TweetContent,
  'notifiedAt' | 'receivedAt'
> {
  notifiedAt: string | null;
  receivedAt: string;
}

export type TweetIngestionResult =
  | {
      status: 'accepted';
      duplicate: boolean;
      tweet: StoredTweetContent;
    }
  | {
      status: 'ignored';
      reason: 'not_a_tweet_notification' | 'filtered_by_preferences';
    };

export function serializeTweetContent(tweet: TweetContent): StoredTweetContent {
  return {
    ...tweet,
    notifiedAt: tweet.notifiedAt?.toISOString() ?? null,
    receivedAt: tweet.receivedAt.toISOString(),
  };
}
