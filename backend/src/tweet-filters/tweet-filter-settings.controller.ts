import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../auth/app-auth.guard.js';
import type { AppUser } from '../auth/auth.model.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UpdateTweetFilterSettingsDto } from './tweet-filter-settings.dto.js';
import type { TweetFilterSettings } from './tweet-filter.model.js';
import { TweetFilterSettingsService } from './tweet-filter-settings.service.js';

@Controller('tweet-filter-settings')
@UseGuards(AppAuthGuard)
export class TweetFilterSettingsController {
  constructor(private readonly settingsService: TweetFilterSettingsService) {}

  @Get()
  get(@CurrentUser() user: AppUser): Promise<TweetFilterSettings> {
    return this.settingsService.get(user.id);
  }

  @Put()
  save(
    @CurrentUser() user: AppUser,
    @Body() settings: UpdateTweetFilterSettingsDto,
  ): Promise<TweetFilterSettings> {
    return this.settingsService.save(user.id, settings);
  }
}
