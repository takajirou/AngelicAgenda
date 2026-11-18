export const tweetFilterCategories = ['live_ticket', 'goods'] as const;

export type TweetFilterCategory = (typeof tweetFilterCategories)[number];

export interface TweetFilterSettings {
  filteringEnabled: boolean;
  categories: TweetFilterCategory[];
}
