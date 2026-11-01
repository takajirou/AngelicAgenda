import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AppUser, StoredXSession, UserWithPassword } from './auth.model.js';
import { AuthRepository } from './auth.repository.js';

interface UserRow {
  id: string;
  email: string;
  password_salt: Buffer;
  password_hash: Buffer;
}

interface XSessionRow {
  user_id: string;
  encrypted_config: string;
  connected_at: Date;
}

interface CountRow { count: string; }

@Injectable()
export class PostgresAuthRepository extends AuthRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async createUser(input: UserWithPassword): Promise<AppUser | undefined> {
    const result = await this.database.query<UserRow>(
      `INSERT INTO app_users (id, email, password_salt, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, password_salt, password_hash`,
      [input.id, input.email, input.passwordSalt, input.passwordHash],
    );
    return result.rows[0] ? this.toUser(result.rows[0]) : undefined;
  }

  async findUserByEmail(email: string): Promise<UserWithPassword | undefined> {
    const result = await this.database.query<UserRow>(
      `SELECT id, email, password_salt, password_hash
       FROM app_users WHERE email = $1`,
      [email],
    );
    const row = result.rows[0];
    return row
      ? {
          ...this.toUser(row),
          passwordSalt: row.password_salt,
          passwordHash: row.password_hash,
        }
      : undefined;
  }

  async createAuthSession(input: {
    id: string;
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.query('DELETE FROM app_auth_sessions WHERE expires_at <= now()');
    await this.database.query(
      `INSERT INTO app_auth_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  async findUserByTokenHash(tokenHash: Buffer): Promise<AppUser | undefined> {
    const result = await this.database.query<UserRow>(
      `SELECT users.id, users.email, users.password_salt, users.password_hash
       FROM app_auth_sessions sessions
       JOIN app_users users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] ? this.toUser(result.rows[0]) : undefined;
  }

  async revokeAuthSession(tokenHash: Buffer): Promise<void> {
    await this.database.query('DELETE FROM app_auth_sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.database.query('DELETE FROM app_users WHERE id = $1', [userId]);
  }

  async upsertXSession(userId: string, encryptedConfig: string): Promise<void> {
    await this.database.query(
      `INSERT INTO app_x_sessions (user_id, encrypted_config)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         encrypted_config = EXCLUDED.encrypted_config,
         connected_at = now(),
         updated_at = now()`,
      [userId, encryptedConfig],
    );
  }

  async findXSession(userId: string): Promise<StoredXSession | undefined> {
    const result = await this.database.query<XSessionRow>(
      `SELECT user_id, encrypted_config, connected_at
       FROM app_x_sessions WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ? this.toXSession(result.rows[0]) : undefined;
  }

  async listXSessions(): Promise<StoredXSession[]> {
    const result = await this.database.query<XSessionRow>(
      'SELECT user_id, encrypted_config, connected_at FROM app_x_sessions',
    );
    return result.rows.map((row) => this.toXSession(row));
  }

  async countXSessions(): Promise<number> {
    const result = await this.database.query<CountRow>(
      'SELECT count(*)::text AS count FROM app_x_sessions',
    );
    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async deleteXSession(userId: string): Promise<void> {
    await this.database.query('DELETE FROM app_x_sessions WHERE user_id = $1', [userId]);
  }

  private toUser(row: UserRow): AppUser {
    return { id: row.id, email: row.email };
  }

  private toXSession(row: XSessionRow): StoredXSession {
    return {
      userId: row.user_id,
      encryptedConfig: row.encrypted_config,
      connectedAt: row.connected_at,
    };
  }
}
