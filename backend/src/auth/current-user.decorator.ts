import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './app-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.appUser) throw new Error('CurrentUser requires AppAuthGuard');
    return request.appUser;
  },
);

export const CurrentSessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.appSessionToken) throw new Error('CurrentSessionToken requires AppAuthGuard');
    return request.appSessionToken;
  },
);
