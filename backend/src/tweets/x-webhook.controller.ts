import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { XNotificationWebhookDto } from './tweet-content.dto.js';
import type { TweetIngestionResult } from './tweet-content.model.js';
import { TweetContentService } from './tweet-content.service.js';
import { WebhookLoopbackGuard } from './webhook-loopback.guard.js';

@Controller('webhooks/x')
@UseGuards(WebhookLoopbackGuard)
export class XWebhookController {
  constructor(private readonly tweetContentService: TweetContentService) {}

  @Post()
  @HttpCode(200)
  ingest(
    @Body() payload: XNotificationWebhookDto,
  ): Promise<TweetIngestionResult> {
    return this.tweetContentService.ingest(payload);
  }
}
