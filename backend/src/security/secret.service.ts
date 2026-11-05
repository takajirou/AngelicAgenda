import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';

@Injectable()
export class SecretService {
  private readonly cache = new Map<string, string>();

  authPepper(): string {
    return this.readRequired('AUTH_PEPPER', 'AUTH_PEPPER_FILE', 32);
  }

  xSessionEncryptionKey(): Buffer {
    const encoded = this.readRequired(
      'X_SESSION_ENCRYPTION_KEY',
      'X_SESSION_ENCRYPTION_KEY_FILE',
      64,
    );
    if (!/^[0-9a-f]{64}$/i.test(encoded)) {
      throw new Error(
        'X session encryption key must be 64 hexadecimal characters',
      );
    }
    return Buffer.from(encoded, 'hex');
  }

  private readRequired(
    directName: string,
    fileName: string,
    minimumLength: number,
  ): string {
    const cacheKey = `${directName}:${fileName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const direct = process.env[directName];
    const file = process.env[fileName];
    if (direct && file)
      throw new Error(`${directName} and ${fileName} are mutually exclusive`);

    let value: string | undefined;
    if (direct) value = direct.trim();
    else if (file) value = readFileSync(file, 'utf8').trim();

    if (!value || value.length < minimumLength || /[\r\n\p{Cc}]/u.test(value)) {
      throw new Error(`${directName} is missing or invalid`);
    }
    this.cache.set(cacheKey, value);
    return value;
  }

  xApiBearerToken(): string {
    return this.readRequired(
      'X_API_BEARER_TOKEN',
      'X_API_BEARER_TOKEN_FILE',
      20,
    );
  }
}
