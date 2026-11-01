import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from './auth.model.js';
import { AuthService } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  appUser?: AppUser;
  appSessionToken?: string;
}

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    const user = await this.authService.authenticate(token);
    if (!user) throw new UnauthorizedException();
    request.appUser = user;
    request.appSessionToken = token;
    return true;
  }
}
