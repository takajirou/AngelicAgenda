import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { AppUser, StoredXSession, UserWithPassword } from './auth.model.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { SecretService } from '../security/secret.service.js';

class FakeAuthRepository extends AuthRepository {
  user: UserWithPassword | undefined;
  tokenHash: Buffer | undefined;
  sessionUser: AppUser | undefined;

  async createUser(input: UserWithPassword): Promise<AppUser | undefined> {
    if (this.user) return undefined;
    this.user = input;
    return { id: input.id, email: input.email };
  }

  async findUserByEmail(email: string): Promise<UserWithPassword | undefined> {
    return this.user?.email === email ? this.user : undefined;
  }

  async createAuthSession(input: {
    id: string;
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void> {
    this.tokenHash = input.tokenHash;
    if (this.user?.id === input.userId) {
      this.sessionUser = { id: this.user.id, email: this.user.email };
    }
  }

  async findUserByTokenHash(tokenHash: Buffer): Promise<AppUser | undefined> {
    return this.tokenHash?.equals(tokenHash) ? this.sessionUser : undefined;
  }

  async revokeAuthSession(tokenHash: Buffer): Promise<void> {
    if (this.tokenHash?.equals(tokenHash)) this.sessionUser = undefined;
  }

  async deleteUser(): Promise<void> { this.user = undefined; }
  async upsertXSession(): Promise<void> {}
  async findXSession(): Promise<StoredXSession | undefined> { return undefined; }
  async listXSessions(): Promise<StoredXSession[]> { return []; }
  async countXSessions(): Promise<number> { return 0; }
  async deleteXSession(): Promise<void> {}
}

describe('AuthService', () => {
  let repository: FakeAuthRepository;
  let service: AuthService;
  const originalPepper = process.env.AUTH_PEPPER;

  beforeEach(() => {
    process.env.AUTH_PEPPER = 'p'.repeat(64);
    repository = new FakeAuthRepository();
    service = new AuthService(repository, new SecretService());
  });

  afterEach(() => {
    if (originalPepper === undefined) delete process.env.AUTH_PEPPER;
    else process.env.AUTH_PEPPER = originalPepper;
  });

  it('hashes the password and issues a hashed bearer session', async () => {
    const session = await service.register({
      email: ' User@Example.com ',
      password: 'password-1234',
    });

    expect(session.user.email).toBe('user@example.com');
    expect(repository.user?.passwordHash.toString()).not.toContain('password-1234');
    expect(repository.tokenHash?.toString()).not.toContain(session.token);
    await expect(service.authenticate(session.token)).resolves.toEqual(session.user);
  });

  it('rejects duplicate registration', async () => {
    await service.register({ email: 'user@example.com', password: 'password-1234' });
    await expect(
      service.register({ email: 'user@example.com', password: 'another-pass-1234' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a wrong password without revealing whether the user exists', async () => {
    await service.register({ email: 'user@example.com', password: 'password-1234' });
    await expect(
      service.login({ email: 'user@example.com', password: 'incorrect-1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login({ email: 'missing@example.com', password: 'incorrect-1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
