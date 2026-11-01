import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AngelicAngelService } from '../integrations/angelic-angel/angelic-angel.service.js';
import { XNotificationWebhookDto } from './tweet-content.dto.js';
import type { TweetIngestionResult } from './tweet-content.model.js';
import { TweetContentService } from './tweet-content.service.js';
import { WebhookLoopbackGuard } from './webhook-loopback.guard.js';

@Controller('webhooks/x')
@UseGuards(WebhookLoopbackGuard)
export class XWebhookController {
  constructor(
    private readonly tweetContentService: TweetContentService,
    private readonly angelicAngelService: AngelicAngelService,
  ) {}

  @Post(':userId/:signature')
  @HttpCode(200)
  ingest(
    @Param('userId') userId: string,
    @Param('signature') signature: string,
    @Body() payload: XNotificationWebhookDto,
  ): Promise<TweetIngestionResult> {
    this.angelicAngelService.verifyWebhookRoute(userId, signature);
    return this.tweetContentService.ingest(userId, payload);
  }
}
