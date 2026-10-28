import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Request } from 'express';

function readSetupToken(): string | undefined {
  const directToken = process.env.ANGELIC_SETUP_TOKEN;
  const tokenFile = process.env.ANGELIC_SETUP_TOKEN_FILE;

  if (directToken && tokenFile) return undefined;
  if (directToken) return directToken;
  if (!tokenFile) return undefined;

  try {
    return readFileSync(tokenFile, 'utf8').trim();
  } catch {
    return undefined;
  }
}

@Injectable()
export class SetupTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedToken = readSetupToken();
    if (
      !expectedToken ||
      expectedToken.length < 32 ||
      expectedToken.length > 512 ||
      /[\s\p{Cc}]/u.test(expectedToken)
    ) {
      throw new ServiceUnavailableException(
        'Angelic Angel setup is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const providedToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';

    const expected = Buffer.from(expectedToken);
    const provided = Buffer.from(providedToken);
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
