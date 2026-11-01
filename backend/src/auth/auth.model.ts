export interface AppUser {
  id: string;
  email: string;
}

export interface UserWithPassword extends AppUser {
  passwordSalt: Buffer;
  passwordHash: Buffer;
}

export interface AuthSessionResult {
  token: string;
  expiresAt: string;
  user: AppUser;
}

export interface StoredXSession {
  userId: string;
  encryptedConfig: string;
  connectedAt: Date;
}
