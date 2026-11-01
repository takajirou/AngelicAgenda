import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isIP } from 'node:net';

@Injectable()
export class WebhookLoopbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const remoteAddress = request.socket.remoteAddress ?? '';
    const normalizedAddress = remoteAddress.startsWith('::ffff:')
      ? remoteAddress.slice('::ffff:'.length)
      : remoteAddress;

    const isLoopback =
      normalizedAddress === '::1' ||
      (isIP(normalizedAddress) === 4 && normalizedAddress.startsWith('127.'));
    if (!isLoopback) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
