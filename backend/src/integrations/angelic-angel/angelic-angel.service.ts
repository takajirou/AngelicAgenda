import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { Readable } from 'node:stream';
import { AuthRepository } from '../../auth/auth.repository.js';
import type { ProvisionXSessionDto } from './angelic-angel.dto.js';
import { XSessionCipherService } from './x-session-cipher.service.js';

interface AngelicAngelRuntime {
  binaryPath: string;
  configDirectory: string;
  webhookBaseUrl: string;
}

@Injectable()
export class AngelicAngelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AngelicAngelService.name);
  private readonly provisioningUsers = new Set<string>();
  private readonly listeners = new Map<string, ChildProcess>();
  private readonly stoppingUsers = new Set<string>();
  private shuttingDown = false;

  constructor(
    private readonly repository: AuthRepository,
    private readonly cipher: XSessionCipherService,
  ) {}

  async onModuleInit(): Promise<void> {
    const runtime = this.runtimeConfiguration(false);
    if (!runtime) return;
    await mkdir(runtime.configDirectory, { recursive: true, mode: 0o700 });
    for (const session of await this.repository.listXSessions()) {
      try {
        const config = this.cipher.decrypt(session.userId, session.encryptedConfig);
        await this.writeRuntimeConfig(runtime, session.userId, config);
        await this.startListener(runtime, session.userId);
      } catch {
        this.logger.error('Stored Angelic Angel session could not be restored');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    const userIds = [...this.listeners.keys()];
    await Promise.all(userIds.map((userId) => this.stopListener(userId)));
    await Promise.all(userIds.map((userId) => this.removeRuntimeConfig(userId)));
  }

  async provision(userId: string, input: ProvisionXSessionDto): Promise<void> {
    if (this.provisioningUsers.has(userId)) {
      throw new ServiceUnavailableException('Angelic Angel setup is already running');
    }
    this.provisioningUsers.add(userId);
    try {
      await this.performProvision(userId, input);
    } finally {
      this.provisioningUsers.delete(userId);
    }
  }

  async isConnected(userId: string): Promise<boolean> {
    return this.listeners.has(userId) && Boolean(await this.repository.findXSession(userId));
  }

  async disconnect(userId: string): Promise<void> {
    await this.stopListener(userId);
    await this.repository.deleteXSession(userId);
    await this.removeRuntimeConfig(userId);
  }

  verifyWebhookRoute(userId: string, signature: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
      !this.cipher.verifyWebhookSignature(userId, signature)
    ) {
      throw new UnauthorizedException();
    }
  }

  private async performProvision(userId: string, input: ProvisionXSessionDto): Promise<void> {
    const runtime = this.runtimeConfiguration(true);
    const existingSession = await this.repository.findXSession(userId);
    const maximumSessions = this.maximumActiveSessions();
    if (!existingSession && (await this.repository.countXSessions()) >= maximumSessions) {
      throw new ServiceUnavailableException('X session capacity has been reached');
    }
    await mkdir(runtime.configDirectory, { recursive: true, mode: 0o700 });
    const pendingPath = join(runtime.configDirectory, `${randomUUID()}.pending`);
    try {
      await this.writeInitialConfig(pendingPath, input);
      await this.runRegistration(runtime.binaryPath, pendingPath);
      await chmod(pendingPath, 0o600);
      const registeredConfig = await readFile(pendingPath, 'utf8');
      await this.repository.upsertXSession(
        userId,
        this.cipher.encrypt(userId, registeredConfig),
      );
      await this.stopListener(userId);
      await rename(pendingPath, this.configPath(runtime, userId));
      await this.startListener(runtime, userId);
    } catch (error) {
      await unlink(pendingPath).catch(() => undefined);
      this.logger.error('Angelic Angel provisioning failed');
      throw new ServiceUnavailableException('Angelic Angel provisioning failed', { cause: error });
    }
  }

  private maximumActiveSessions(): number {
    const configured = Number.parseInt(process.env.MAX_ACTIVE_X_SESSIONS ?? '20', 10);
    return Number.isSafeInteger(configured) && configured >= 1 && configured <= 1_000
      ? configured
      : 20;
  }

  private runtimeConfiguration(required: true): AngelicAngelRuntime;
  private runtimeConfiguration(required: false): AngelicAngelRuntime | undefined;
  private runtimeConfiguration(required: boolean): AngelicAngelRuntime | undefined {
    const binaryPath = process.env.ANGELIC_ANGEL_BINARY_PATH;
    const configDirectory = process.env.ANGELIC_ANGEL_CONFIG_DIRECTORY;
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
    const validWebhook = (() => {
      if (!webhookBaseUrl) return false;
      try {
        const url = new URL(webhookBaseUrl);
        return (
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
          url.pathname === '/webhooks/x/' &&
          !url.username && !url.password && !url.search && !url.hash
        );
      } catch {
        return false;
      }
    })();
    if (
      !binaryPath || !configDirectory || !isAbsolute(binaryPath) ||
      !isAbsolute(configDirectory) || !validWebhook
    ) {
      if (required) throw new ServiceUnavailableException('Angelic Angel runtime is not configured');
      return undefined;
    }
    return { binaryPath, configDirectory, webhookBaseUrl: webhookBaseUrl! };
  }

  private async writeInitialConfig(configPath: string, input: ProvisionXSessionDto): Promise<void> {
    const content = [
      '[twitter]',
      `auth_token = ${JSON.stringify(input.authToken)}`,
      `ct0 = ${JSON.stringify(input.ct0)}`,
      '',
    ].join('\n');
    await writeFile(configPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  }

  private async writeRuntimeConfig(
    runtime: AngelicAngelRuntime,
    userId: string,
    config: string,
  ): Promise<void> {
    const pendingPath = join(runtime.configDirectory, `${randomUUID()}.restore`);
    await writeFile(pendingPath, config, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(pendingPath, this.configPath(runtime, userId));
  }

  private runRegistration(binaryPath: string, configPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, ['--config', configPath, 'register'], {
        env: { ...process.env },
        stdio: 'ignore',
      });
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish(new Error('Angelic Angel registration timed out'));
      }, 60_000);
      child.once('error', (error) => finish(error));
      child.once('exit', (code) => {
        if (code === 0) finish();
        else finish(new Error(`Angelic Angel registration exited with code ${String(code)}`));
      });
    });
  }

  private startListener(runtime: AngelicAngelRuntime, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = new URL(
        `${userId}/${this.cipher.webhookSignature(userId)}`,
        runtime.webhookBaseUrl,
      ).toString();
      const child = spawn(
        runtime.binaryPath,
        ['--config', this.configPath(runtime, userId), '--verbose', 'listen'],
        { env: { ...process.env, WEBHOOK_ENDPOINT: endpoint }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      this.listeners.set(userId, child);
      this.observeListenerDiagnostics(child.stdout);
      this.observeListenerDiagnostics(child.stderr);
      child.once('spawn', () => {
        this.logger.log('Angelic Angel listener started');
        resolve();
      });
      child.once('error', (error) => {
        if (this.listeners.get(userId) === child) this.listeners.delete(userId);
        reject(error);
      });
      child.once('exit', (code) => {
        if (this.listeners.get(userId) === child) this.listeners.delete(userId);
        if (!this.shuttingDown && !this.stoppingUsers.has(userId)) {
          this.logger.warn(`Angelic Angel listener stopped with code ${String(code)}`);
        }
      });
    });
  }

  private async stopListener(userId: string): Promise<void> {
    const child = this.listeners.get(userId);
    this.listeners.delete(userId);
    if (!child || child.exitCode !== null || child.signalCode !== null) return;

    this.stoppingUsers.add(userId);
    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          finish();
        }, 5_000);
        child.once('exit', finish);
        child.once('error', finish);
        child.kill('SIGTERM');
      });
    } finally {
      this.stoppingUsers.delete(userId);
    }
  }

  private configPath(runtime: AngelicAngelRuntime, userId: string): string {
    return join(runtime.configDirectory, `${userId}.toml`);
  }

  private async removeRuntimeConfig(userId: string): Promise<void> {
    const runtime = this.runtimeConfiguration(false);
    if (!runtime) return;
    await unlink(this.configPath(runtime, userId)).catch(() => undefined);
  }

  private observeListenerDiagnostics(stream: Readable | null): void {
    if (!stream) return;
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) this.logSafeListenerEvent(line);
    });
    stream.once('end', () => {
      if (pending) this.logSafeListenerEvent(pending);
    });
  }

  private logSafeListenerEvent(line: string): void {
    if (line.includes('WebSocket connection established')) this.logger.log('Angelic Angel AutoPush connection established');
    else if (line.includes('notification received')) this.logger.log('Angelic Angel notification received');
    else if (line.includes('notification decrypted')) this.logger.log('Angelic Angel notification decrypted');
    else if (line.includes('webhook request succeeded')) this.logger.log('Angelic Angel webhook delivery succeeded');
    else if (line.includes('WebSocket connection failed')) this.logger.warn('Angelic Angel AutoPush connection failed; retrying');
    else if (line.includes('server requested backoff')) this.logger.warn('Angelic Angel AutoPush server requested backoff');
    else if (line.includes('decryption error')) this.logger.warn('Angelic Angel notification decryption failed');
    else if (line.includes('webhook request failed')) {
      const status = line.match(/\bstatus=(\d{3})\b/)?.[1];
      this.logger.warn(status ? `Angelic Angel webhook delivery failed (HTTP ${status})` : 'Angelic Angel webhook delivery failed');
    } else if (line.includes('notification processing error')) this.logger.warn('Angelic Angel notification processing failed');
    else if (line.includes('fatal error')) this.logger.error('Angelic Angel listener requires re-registration');
  }
}
