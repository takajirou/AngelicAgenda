import { SecretService } from '../../security/secret.service.js';
import { XSessionCipherService } from './x-session-cipher.service.js';

describe('XSessionCipherService', () => {
  const originalKey = process.env.X_SESSION_ENCRYPTION_KEY;
  const userId = '11111111-1111-4111-8111-111111111111';
  let service: XSessionCipherService;

  beforeEach(() => {
    process.env.X_SESSION_ENCRYPTION_KEY = '1'.repeat(64);
    service = new XSessionCipherService(new SecretService());
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.X_SESSION_ENCRYPTION_KEY;
    else process.env.X_SESSION_ENCRYPTION_KEY = originalKey;
  });

  it('encrypts X configuration and binds it to the user', () => {
    const plaintext = 'auth_token = "secret-cookie"';
    const encrypted = service.encrypt(userId, plaintext);

    expect(encrypted).not.toContain('secret-cookie');
    expect(service.decrypt(userId, encrypted)).toBe(plaintext);
    expect(() =>
      service.decrypt('22222222-2222-4222-8222-222222222222', encrypted),
    ).toThrow();
  });

  it('rejects a modified webhook signature', () => {
    const signature = service.webhookSignature(userId);
    expect(service.verifyWebhookSignature(userId, signature)).toBe(true);
    expect(service.verifyWebhookSignature(userId, `${signature}x`)).toBe(false);
  });
});
