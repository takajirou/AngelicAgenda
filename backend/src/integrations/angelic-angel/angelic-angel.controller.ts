import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../auth/app-auth.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AppUser } from '../../auth/auth.model.js';
import {
  ProvisionXSessionDto,
  ProvisionXSessionResponseDto,
  XSessionStatusResponseDto,
} from './angelic-angel.dto.js';
import { AngelicAngelService } from './angelic-angel.service.js';

@Controller('integrations/angelic-angel')
@UseGuards(AppAuthGuard)
export class AngelicAngelController {
  constructor(private readonly angelicAngelService: AngelicAngelService) {}

  @Post('session')
  @HttpCode(200)
  async provisionSession(
    @CurrentUser() user: AppUser,
    @Body() input: ProvisionXSessionDto,
  ): Promise<ProvisionXSessionResponseDto> {
    await this.angelicAngelService.provision(user.id, input);
    return { status: 'registered' };
  }

  @Get('session')
  async sessionStatus(
    @CurrentUser() user: AppUser,
  ): Promise<XSessionStatusResponseDto> {
    return { connected: await this.angelicAngelService.isConnected(user.id) };
  }

  @Delete('session')
  @HttpCode(204)
  disconnect(@CurrentUser() user: AppUser): Promise<void> {
    return this.angelicAngelService.disconnect(user.id);
  }
}
