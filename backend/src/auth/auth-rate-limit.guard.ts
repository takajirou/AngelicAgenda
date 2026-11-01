import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { isIP } from 'node:net';

interface AttemptBucket {
  count: number;
  resetsAt: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, AttemptBucket>();
  private readonly windowMilliseconds = 15 * 60 * 1000;
  private readonly maximumAttempts = 10;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.clientAddress(request);
    const now = Date.now();
    const existing = this.attempts.get(key);
    const bucket =
      !existing || existing.resetsAt <= now
        ? { count: 0, resetsAt: now + this.windowMilliseconds }
        : existing;
    bucket.count += 1;
    this.attempts.set(key, bucket);
    if (bucket.count > this.maximumAttempts) {
      throw new HttpException(
        'ログイン試行回数が多すぎます。時間をおいて再試行してください。',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private clientAddress(request: Request): string {
    const cloudflareAddress = request.header('cf-connecting-ip')?.trim();
    if (cloudflareAddress && isIP(cloudflareAddress)) return cloudflareAddress;
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
