import { Injectable } from '@nestjs/common';
import { SecretService } from '../../security/secret.service.js';

const X_API_BASE_URL = 'https://api.x.com/2';
const REQUEST_TIMEOUT_MS = 5_000;

export interface XApiProfile {
  xUserId: string;
  username: string;
  displayName: string;
  profileImageUrl: string | null;
}

export class XApiClientError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = XApiClientError.name;
  }
}

@Injectable()
export class XApiClientService {
  constructor(private readonly secretService: SecretService) {}

  async getProfileByUsername(
    inputUsername: string,
  ): Promise<XApiProfile | null> {
    const username = this.normalizeUsername(inputUsername);
    const url = new URL(
      `/2/users/by/username/${encodeURIComponent(username)}`,
      X_API_BASE_URL,
    );
    url.searchParams.set('user.fields', 'profile_image_url');

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.secretService.xApiBearerToken()}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new XApiClientError('X APIへの接続に失敗しました', undefined, {
        cause: error,
      });
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new XApiClientError(
        this.errorMessageForStatus(response.status),
        response.status,
      );
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      throw new XApiClientError(
        'X APIから不正なJSONレスポンスを受信しました',
        response.status,
        { cause: error },
      );
    }

    return this.parseProfile(body);
  }

  private normalizeUsername(inputUsername: string): string {
    const username = inputUsername.trim().replace(/^@/, '');

    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
      throw new XApiClientError('Xのユーザー名が不正です');
    }

    return username;
  }

  private parseProfile(body: unknown): XApiProfile {
    if (!this.isRecord(body) || !this.isRecord(body.data)) {
      throw new XApiClientError('X APIのレスポンスにユーザー情報がありません');
    }

    const {
      id,
      username,
      name,
      profile_image_url: profileImageUrl,
    } = body.data;

    if (
      typeof id !== 'string' ||
      !/^\d{1,32}$/.test(id) ||
      typeof username !== 'string' ||
      !/^[A-Za-z0-9_]{1,15}$/.test(username) ||
      typeof name !== 'string' ||
      name.length === 0
    ) {
      throw new XApiClientError(
        'X APIのユーザー情報が期待した形式ではありません',
      );
    }

    return {
      xUserId: id,
      username,
      displayName: name,
      profileImageUrl: this.parseProfileImageUrl(profileImageUrl),
    };
  }

  private parseProfileImageUrl(value: unknown): string | null {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > 2_048) {
      throw new XApiClientError('X APIのアイコンURLが不正です');
    }

    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new XApiClientError('X APIのアイコンURLが不正です');
    }

    if (url.protocol !== 'https:') {
      throw new XApiClientError('X APIのアイコンURLがHTTPSではありません');
    }

    return url.toString();
  }

  private errorMessageForStatus(statusCode: number): string {
    if (statusCode === 401 || statusCode === 403) {
      return 'X APIの認証に失敗しました';
    }

    if (statusCode === 429) {
      return 'X APIの利用上限に達しました';
    }

    if (statusCode >= 500) {
      return 'X APIで一時的な障害が発生しています';
    }

    return `X APIリクエストに失敗しました（HTTP ${statusCode}）`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
