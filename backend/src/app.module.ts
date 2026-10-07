import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AngelicAngelController } from './integrations/angelic-angel/angelic-angel.controller.js';
import { AngelicAngelService } from './integrations/angelic-angel/angelic-angel.service.js';
import { SetupTokenGuard } from './integrations/angelic-angel/setup-token.guard.js';

@Module({
  imports: [],
  controllers: [AppController, AngelicAngelController],
  providers: [AppService, AngelicAngelService, SetupTokenGuard],
})
export class AppModule {}
