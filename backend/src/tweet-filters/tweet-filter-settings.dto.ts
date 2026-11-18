import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
} from 'class-validator';
import {
  tweetFilterCategories,
  type TweetFilterCategory,
} from './tweet-filter.model.js';

export class UpdateTweetFilterSettingsDto {
  @IsBoolean()
  filteringEnabled!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(tweetFilterCategories.length)
  @ArrayUnique()
  @IsIn(tweetFilterCategories, { each: true })
  categories!: TweetFilterCategory[];
}
