import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../auth/app-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AppUser } from '../auth/auth.model.js';
import { ListTweetContentsQueryDto } from './tweet-content.dto.js';
import type { StoredTweetContent } from './tweet-content.model.js';
import { TweetContentService } from './tweet-content.service.js';

@Controller('tweets')
@UseGuards(AppAuthGuard)
export class TweetContentController {
  constructor(private readonly tweetContentService: TweetContentService) {}

  @Get()
  findLatest(
    @CurrentUser() user: AppUser,
    @Query() query: ListTweetContentsQueryDto,
  ): Promise<StoredTweetContent[]> {
    return this.tweetContentService.findLatest(user.id, query.limit);
  }
}
