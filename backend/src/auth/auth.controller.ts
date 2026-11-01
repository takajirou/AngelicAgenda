import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AngelicAngelService } from '../integrations/angelic-angel/angelic-angel.service.js';
import { AppAuthGuard } from './app-auth.guard.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import { AuthCredentialsDto, AuthSessionResponseDto } from './auth.dto.js';
import type { AppUser } from './auth.model.js';
import { AuthService } from './auth.service.js';
import { CurrentSessionToken, CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly angelicAngelService: AngelicAngelService,
  ) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  register(@Body() credentials: AuthCredentialsDto): Promise<AuthSessionResponseDto> {
    return this.authService.register(credentials);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  login(@Body() credentials: AuthCredentialsDto): Promise<AuthSessionResponseDto> {
    return this.authService.login(credentials);
  }

  @Get('me')
  @UseGuards(AppAuthGuard)
  me(@CurrentUser() user: AppUser): AppUser {
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AppAuthGuard)
  logout(@CurrentSessionToken() token: string): Promise<void> {
    return this.authService.logout(token);
  }

  @Delete('account')
  @HttpCode(204)
  @UseGuards(AppAuthGuard)
  async deleteAccount(@CurrentUser() user: AppUser): Promise<void> {
    await this.angelicAngelService.disconnect(user.id);
    await this.authService.deleteAccount(user.id);
  }
}
