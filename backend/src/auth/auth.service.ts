import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import type { AuthCredentialsDto } from './auth.dto.js';
import type { AppUser, AuthSessionResult } from './auth.model.js';
import { AuthRepository } from './auth.repository.js';
import { SecretService } from '../security/secret.service.js';

const sessionLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;
const passwordHashLength = 64;

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly secrets: SecretService,
  ) {}

  async register(credentials: AuthCredentialsDto): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(credentials.email);
    const salt = randomBytes(16);
    const passwordHash = await this.hashPassword(credentials.password, salt);
    const user = await this.repository.createUser({
      id: randomUUID(),
      email,
      passwordSalt: salt,
      passwordHash,
    });
    if (!user) throw new ConflictException('このメールアドレスは既に登録されています。');
    return this.issueSession(user);
  }

  async login(credentials: AuthCredentialsDto): Promise<AuthSessionResult> {
    const email = this.normalizeEmail(credentials.email);
    const user = await this.repository.findUserByEmail(email);
    const salt = user?.passwordSalt ?? randomBytes(16);
    const actualHash = await this.hashPassword(credentials.password, salt);
    const expectedHash = user?.passwordHash ?? randomBytes(passwordHashLength);
    const valid =
      actualHash.length === expectedHash.length &&
      timingSafeEqual(actualHash, expectedHash);
    if (!user || !valid) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません。');
    }
    return this.issueSession(user);
  }

  async authenticate(token: string): Promise<AppUser | undefined> {
    if (!this.isValidSessionToken(token)) return undefined;
    return this.repository.findUserByTokenHash(this.hashSessionToken(token));
  }

  async logout(token: string): Promise<void> {
    if (!this.isValidSessionToken(token)) return;
    await this.repository.revokeAuthSession(this.hashSessionToken(token));
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.repository.deleteUser(userId);
  }

  private async issueSession(user: AppUser): Promise<AuthSessionResult> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionLifetimeMilliseconds);
    await this.repository.createAuthSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash: this.hashSessionToken(token),
      expiresAt,
    });
    return { token, expiresAt: expiresAt.toISOString(), user };
  }

  private hashPassword(password: string, salt: Buffer): Promise<Buffer> {
    const pepperedPassword = `${password}\u0000${this.secrets.authPepper()}`;
    return new Promise((resolve, reject) => {
      scrypt(
        pepperedPassword,
        salt,
        passwordHashLength,
        { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (error, derivedKey) => {
          if (error) reject(error);
          else resolve(derivedKey);
        },
      );
    });
  }

  private hashSessionToken(token: string): Buffer {
    return createHmac('sha256', this.secrets.authPepper()).update(token).digest();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isValidSessionToken(token: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(token);
  }
}
