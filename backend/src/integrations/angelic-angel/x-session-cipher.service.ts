import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { SecretService } from '../../security/secret.service.js';

interface EncryptedEnvelope {
  v: 1;
  iv: string;
  ciphertext: string;
  tag: string;
}

@Injectable()
export class XSessionCipherService {
  constructor(private readonly secrets: SecretService) {}

  encrypt(userId: string, plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    cipher.setAAD(Buffer.from(userId));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      v: 1,
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
    };
    return JSON.stringify(envelope);
  }

  decrypt(userId: string, encoded: string): string {
    const parsed: unknown = JSON.parse(encoded);
    if (!this.isEnvelope(parsed)) throw new Error('Invalid encrypted X session');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(parsed.iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  webhookSignature(userId: string): string {
    return createHmac('sha256', this.signingKey())
      .update(`webhook:${userId}`)
      .digest('base64url');
  }

  verifyWebhookSignature(userId: string, provided: string): boolean {
    const expected = Buffer.from(this.webhookSignature(userId));
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private encryptionKey(): Buffer {
    return this.deriveKey('x-session-encryption');
  }

  private signingKey(): Buffer {
    return this.deriveKey('webhook-signing');
  }

  private deriveKey(purpose: string): Buffer {
    return createHmac('sha256', this.secrets.xSessionEncryptionKey())
      .update(purpose)
      .digest();
  }

  private isEnvelope(value: unknown): value is EncryptedEnvelope {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<EncryptedEnvelope>;
    return (
      candidate.v === 1 &&
      typeof candidate.iv === 'string' &&
      typeof candidate.ciphertext === 'string' &&
      typeof candidate.tag === 'string'
    );
  }
}
