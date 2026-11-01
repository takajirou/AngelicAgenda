import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AngelicAngelController } from './integrations/angelic-angel/angelic-angel.controller.js';
import { AngelicAngelService } from './integrations/angelic-angel/angelic-angel.service.js';
import { SetupTokenGuard } from './integrations/angelic-angel/setup-token.guard.js';
import { PostgresTweetContentRepository } from './tweets/postgres-tweet-content.repository.js';
import { TweetContentController } from './tweets/tweet-content.controller.js';
import { TweetContentRepository } from './tweets/tweet-content.repository.js';
import { TweetContentService } from './tweets/tweet-content.service.js';
import { WebhookLoopbackGuard } from './tweets/webhook-loopback.guard.js';
import { XWebhookController } from './tweets/x-webhook.controller.js';

@Module({
  imports: [],
  controllers: [
    AppController,
    AngelicAngelController,
    XWebhookController,
    TweetContentController,
  ],
  providers: [
    AppService,
    AngelicAngelService,
    SetupTokenGuard,
    WebhookLoopbackGuard,
    TweetContentService,
    {
      provide: TweetContentRepository,
      useClass: PostgresTweetContentRepository,
    },
  ],
})
export class AppModule {}
