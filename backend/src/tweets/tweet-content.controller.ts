import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SetupTokenGuard } from '../integrations/angelic-angel/setup-token.guard.js';
import { ListTweetContentsQueryDto } from './tweet-content.dto.js';
import type { StoredTweetContent } from './tweet-content.model.js';
import { TweetContentService } from './tweet-content.service.js';

@Controller('tweets')
@UseGuards(SetupTokenGuard)
export class TweetContentController {
  constructor(private readonly tweetContentService: TweetContentService) {}

  @Get()
  findLatest(
    @Query() query: ListTweetContentsQueryDto,
  ): Promise<StoredTweetContent[]> {
    return this.tweetContentService.findLatest(query.limit);
  }
}
