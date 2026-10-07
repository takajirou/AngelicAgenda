import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AngelicAngelService } from './angelic-angel.service.js';

describe('AngelicAngelService', () => {
  let directory: string;
  let binaryPath: string;
  let configPath: string;
  let service: AngelicAngelService;
  const originalEnvironment = { ...process.env };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'angelic-angel-test-'));
    binaryPath = join(directory, 'fake-angelic-angel');
    configPath = join(directory, 'angelic-angel.toml');
    await writeFile(
      binaryPath,
      [
        '#!/bin/sh',
        'if [ "$3" = "register" ]; then',
        '  [ "$FAKE_REGISTER_FAIL" = "1" ] && exit 1',
        '  printf "\\n[registration]\\nid = \\"test\\"\\n" >> "$2"',
        '  exit 0',
        'fi',
        'if [ "$3" = "listen" ]; then',
        '  trap "exit 0" TERM',
        '  while :; do sleep 1; done',
        'fi',
        'exit 2',
        '',
      ].join('\n'),
      { mode: 0o700 },
    );
    await chmod(binaryPath, 0o700);
    process.env.ANGELIC_ANGEL_BINARY_PATH = binaryPath;
    process.env.ANGELIC_ANGEL_CONFIG_PATH = configPath;
    process.env.WEBHOOK_ENDPOINT = 'https://agenda.example.com/webhooks/x';
    service = new AngelicAngelService();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    process.env = { ...originalEnvironment };
    await rm(directory, { recursive: true, force: true });
  });

  it('registers the session, stores a private config, and starts listening', async () => {
    await service.provision({
      authToken: 'a'.repeat(32),
      ct0: 'b'.repeat(32),
    });

    const content = await readFile(configPath, 'utf8');
    const mode = (await stat(configPath)).mode & 0o777;
    expect(content).toContain(`auth_token = "${'a'.repeat(32)}"`);
    expect(content).toContain(`ct0 = "${'b'.repeat(32)}"`);
    expect(content).toContain('[registration]');
    expect(mode).toBe(0o600);
  });

  it('keeps the previous config when registration fails', async () => {
    await writeFile(configPath, 'previous config', { mode: 0o600 });
    process.env.FAKE_REGISTER_FAIL = '1';

    await expect(
      service.provision({
        authToken: 'a'.repeat(32),
        ct0: 'b'.repeat(32),
      }),
    ).rejects.toThrow('Angelic Angel provisioning failed');

    await expect(readFile(configPath, 'utf8')).resolves.toBe('previous config');
  });
});
