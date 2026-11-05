import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { AppAuthGuard } from './auth/app-auth.guard.js';
import { AuthRepository } from './auth/auth.repository.js';
import { AuthRateLimitGuard } from './auth/auth-rate-limit.guard.js';
import { AuthService } from './auth/auth.service.js';
import { PostgresAuthRepository } from './auth/postgres-auth.repository.js';
import { DatabaseService } from './database/database.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AngelicAngelController } from './integrations/angelic-angel/angelic-angel.controller.js';
import { AngelicAngelService } from './integrations/angelic-angel/angelic-angel.service.js';
import { XSessionCipherService } from './integrations/angelic-angel/x-session-cipher.service.js';
import { SecretService } from './security/secret.service.js';
import { PostgresTweetContentRepository } from './tweets/postgres-tweet-content.repository.js';
import { TweetContentController } from './tweets/tweet-content.controller.js';
import { TweetContentRepository } from './tweets/tweet-content.repository.js';
import { TweetContentService } from './tweets/tweet-content.service.js';
import { WebhookLoopbackGuard } from './tweets/webhook-loopback.guard.js';
import { XWebhookController } from './tweets/x-webhook.controller.js';
import { XApiClientService } from './integrations/x-api/x-api-client.service.js';
import { XProfileService } from './x-profiles/x-profile.service.js';
import { XProfileRepository } from './x-profiles/x-profile.repository.js';
import { PostgresXProfileRepository } from './x-profiles/postgres-x-profile.repository.js';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    AngelicAngelController,
    XWebhookController,
    TweetContentController,
  ],
  providers: [
    AppService,
    DatabaseService,
    SecretService,
    AuthService,
    AppAuthGuard,
    AuthRateLimitGuard,
    XSessionCipherService,
    AngelicAngelService,
    WebhookLoopbackGuard,
    TweetContentService,
    XApiClientService,
    XProfileService,
    {
      provide: AuthRepository,
      useClass: PostgresAuthRepository,
    },
    {
      provide: TweetContentRepository,
      useClass: PostgresTweetContentRepository,
    },
    {
      provide: XProfileRepository,
      useClass: PostgresXProfileRepository,
    },
  ],
})
export class AppModule {}
