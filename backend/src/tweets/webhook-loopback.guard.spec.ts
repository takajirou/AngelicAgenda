import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { WebhookLoopbackGuard } from './webhook-loopback.guard.js';

function contextWithAddress(remoteAddress: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ socket: { remoteAddress } }),
    }),
  } as unknown as ExecutionContext;
}

describe('WebhookLoopbackGuard', () => {
  const guard = new WebhookLoopbackGuard();

  it.each(['127.0.0.1', '127.42.0.7', '::1', '::ffff:127.0.0.1'])(
    'accepts loopback address %s',
    (address) => {
      expect(guard.canActivate(contextWithAddress(address))).toBe(true);
    },
  );

  it.each(['10.0.0.2', '192.168.1.20', '::ffff:172.18.0.4', ''])(
    'rejects non-loopback address %s',
    (address) => {
      expect(() => guard.canActivate(contextWithAddress(address))).toThrow(
        UnauthorizedException,
      );
    },
  );
});
