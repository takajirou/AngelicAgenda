import type { AppUser, StoredXSession, UserWithPassword } from './auth.model.js';

export abstract class AuthRepository {
  abstract createUser(input: UserWithPassword): Promise<AppUser | undefined>;
  abstract findUserByEmail(email: string): Promise<UserWithPassword | undefined>;
  abstract createAuthSession(input: {
    id: string;
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void>;
  abstract findUserByTokenHash(tokenHash: Buffer): Promise<AppUser | undefined>;
  abstract revokeAuthSession(tokenHash: Buffer): Promise<void>;
  abstract deleteUser(userId: string): Promise<void>;
  abstract upsertXSession(userId: string, encryptedConfig: string): Promise<void>;
  abstract findXSession(userId: string): Promise<StoredXSession | undefined>;
  abstract listXSessions(): Promise<StoredXSession[]>;
  abstract countXSessions(): Promise<number>;
  abstract deleteXSession(userId: string): Promise<void>;
}
