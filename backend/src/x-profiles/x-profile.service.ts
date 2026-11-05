import { Injectable, Logger } from '@nestjs/common';
import { XApiClientService } from '../integrations/x-api/x-api-client.service.js';
import type { XProfile } from './x-profile.model.js';
import { XProfileRepository } from './x-profile.repository.js';

const PROFILE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type XProfileResult =
  | {
      status: 'cached' | 'refreshed' | 'stale';
      profile: XProfile;
    }
  | {
      status: 'not_found' | 'unavailable';
      profile: null;
    };

@Injectable()
export class XProfileService {
  private readonly logger = new Logger(XProfileService.name);

  constructor(
    private readonly repository: XProfileRepository,
    private readonly xApiClient: XApiClientService,
  ) {}

  async getByUsername(username: string): Promise<XProfileResult> {
    const normalizedUsername = this.normalizeUsername(username);
    const existing = await this.repository.findByUsername(normalizedUsername);

    if (existing && this.isCacheFresh(existing.fetchedAt)) {
      return {
        status: 'cached',
        profile: existing,
      };
    }

    try {
      const xUser =
        await this.xApiClient.getProfileByUsername(normalizedUsername);

      if (!xUser) {
        return {
          status: 'not_found',
          profile: null,
        };
      }

      const profile: XProfile = {
        xUserId: xUser.xUserId,
        username: xUser.username.toLowerCase(),
        displayName: xUser.displayName,
        profileImageUrl: xUser.profileImageUrl,
        fetchedAt: new Date(),
      };

      const savedProfile = await this.repository.upsert(profile);

      return {
        status: 'refreshed',
        profile: savedProfile,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to refresh X profile (username=${normalizedUsername}, error=${this.getErrorName(error)})`,
      );

      // X APIが一時的に失敗しても、保存済みの画像を再利用する。
      if (existing) {
        return {
          status: 'stale',
          profile: existing,
        };
      }

      return {
        status: 'unavailable',
        profile: null,
      };
    }
  }

  private normalizeUsername(username: string): string {
    const normalized = username.trim().replace(/^@/, '').toLowerCase();

    if (!/^[a-z0-9_]{1,15}$/.test(normalized)) {
      throw new TypeError('Invalid X username');
    }

    return normalized;
  }

  private isCacheFresh(fetchedAt: Date): boolean {
    const age = Date.now() - fetchedAt.getTime();

    return age >= 0 && age < PROFILE_CACHE_TTL_MS;
  }

  private getErrorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UnknownError';
  }
}
