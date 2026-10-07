import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class SetupTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedToken = process.env.ANGELIC_SETUP_TOKEN;
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
