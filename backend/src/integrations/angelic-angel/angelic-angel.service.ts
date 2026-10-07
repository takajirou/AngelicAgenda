import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type { ProvisionXSessionDto } from './angelic-angel.dto.js';

interface AngelicAngelRuntime {
  binaryPath: string;
  configPath: string;
}

@Injectable()
export class AngelicAngelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AngelicAngelService.name);
  private provisioning: Promise<void> | undefined;
  private listener: ChildProcess | undefined;
  private shuttingDown = false;

  async onModuleInit(): Promise<void> {
    const runtime = this.runtimeConfiguration(false);
    if (!runtime) return;

    try {
      await access(runtime.configPath);
      await this.startListener(runtime);
    } catch {
      this.logger.warn(
        'Angelic Angel listener was not started; provision an X session first',
      );
    }
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.stopListener();
  }

  async provision(input: ProvisionXSessionDto): Promise<void> {
    if (this.provisioning) {
      throw new ServiceUnavailableException(
        'Angelic Angel setup is already running',
      );
    }

    const task = this.performProvision(input);
    this.provisioning = task;
    try {
      await task;
    } finally {
      this.provisioning = undefined;
    }
  }

  private async performProvision(input: ProvisionXSessionDto): Promise<void> {
    const runtime = this.runtimeConfiguration(true);
    const pendingPath = `${runtime.configPath}.${randomUUID()}.pending`;

    try {
      await this.writeConfig(pendingPath, input);
      await this.runRegistration(runtime.binaryPath, pendingPath);
      await chmod(pendingPath, 0o600);
      await rename(pendingPath, runtime.configPath);
      this.stopListener();
      await this.startListener(runtime);
    } catch (error) {
      await unlink(pendingPath).catch(() => undefined);
      this.logger.error('Angelic Angel provisioning failed');
      throw new ServiceUnavailableException(
        'Angelic Angel provisioning failed',
        {
          cause: error,
        },
      );
    }
  }

  private runtimeConfiguration(required: true): AngelicAngelRuntime;
  private runtimeConfiguration(
    required: false,
  ): AngelicAngelRuntime | undefined;
  private runtimeConfiguration(
    required: boolean,
  ): AngelicAngelRuntime | undefined {
    const binaryPath = process.env.ANGELIC_ANGEL_BINARY_PATH;
    const configPath = process.env.ANGELIC_ANGEL_CONFIG_PATH;
    const webhookEndpoint = process.env.WEBHOOK_ENDPOINT;
    const hasValidWebhook = (() => {
      if (!webhookEndpoint) return false;
      try {
        const url = new URL(webhookEndpoint);
        return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
        return false;
      }
    })();

    if (
      !binaryPath ||
      !configPath ||
      !isAbsolute(binaryPath) ||
      !isAbsolute(configPath) ||
      !hasValidWebhook
    ) {
      if (required) {
        throw new ServiceUnavailableException(
          'Angelic Angel runtime is not configured',
        );
      }
      return undefined;
    }

    return { binaryPath, configPath };
  }

  private async writeConfig(
    configPath: string,
    input: ProvisionXSessionDto,
  ): Promise<void> {
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });

    const content = [
      '[twitter]',
      `auth_token = ${JSON.stringify(input.authToken)}`,
      `ct0 = ${JSON.stringify(input.ct0)}`,
      '',
    ].join('\n');

    const file = await open(configPath, 'wx', 0o600);
    try {
      await file.writeFile(content, { encoding: 'utf8' });
      await file.sync();
    } finally {
      await file.close();
    }
  }

  private runRegistration(
    binaryPath: string,
    configPath: string,
  ): Promise<void> {
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
        else
          finish(
            new Error(
              `Angelic Angel registration exited with code ${String(code)}`,
            ),
          );
      });
    });
  }

  private startListener(runtime: AngelicAngelRuntime): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        runtime.binaryPath,
        ['--config', runtime.configPath, 'listen'],
        {
          env: { ...process.env },
          stdio: 'ignore',
        },
      );
      this.listener = child;

      child.once('spawn', () => {
        this.logger.log('Angelic Angel listener started');
        resolve();
      });
      child.once('error', (error) => {
        if (this.listener === child) this.listener = undefined;
        reject(error);
      });
      child.once('exit', (code) => {
        if (this.listener === child) this.listener = undefined;
        if (!this.shuttingDown) {
          this.logger.warn(
            `Angelic Angel listener stopped with code ${String(code)}`,
          );
        }
      });
    });
  }

  private stopListener(): void {
    this.listener?.kill('SIGTERM');
    this.listener = undefined;
  }
}
