import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ProvisionXSessionDto,
  ProvisionXSessionResponseDto,
} from './angelic-angel.dto.js';
import { AngelicAngelService } from './angelic-angel.service.js';
import { SetupTokenGuard } from './setup-token.guard.js';

@Controller('integrations/angelic-angel')
@UseGuards(SetupTokenGuard)
export class AngelicAngelController {
  constructor(private readonly angelicAngelService: AngelicAngelService) {}

  @Post('session')
  @HttpCode(200)
  async provisionSession(
    @Body() input: ProvisionXSessionDto,
  ): Promise<ProvisionXSessionResponseDto> {
    await this.angelicAngelService.provision(input);
    return { status: 'registered' };
  }
}
