import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, execFileSync, spawn } from 'child_process';
import { existsSync } from 'fs';

const NGROK_INSPECTOR_API = 'http://127.0.0.1:4040/api/tunnels';

@Injectable()
export class NgrokTunnelService
  implements OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(NgrokTunnelService.name);
  private ngrokProcess: ChildProcess | null = null;
  private isShuttingDown = false;
  private verifyTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'development') {
      return;
    }

    const command = this.configService.get<string>('CMD_NGROK')?.trim();
    if (!command) {
      return;
    }

    const activeUrls = await this.getActiveTunnelUrls();
    if (activeUrls.length > 0) {
      this.logger.log(`Ngrok tunnel đã chạy sẵn: ${activeUrls.join(', ')}`);
      return;
    }

    this.startTunnelProcess(command);
  }

  onModuleDestroy(): void {
    this.stopTunnelProcess();
  }

  onApplicationShutdown(): void {
    this.stopTunnelProcess();
  }

  private startTunnelProcess(command: string): void {
    this.isShuttingDown = false;
    const { executable, args, useShell } = this.resolveCommand(command);
    this.logger.log(`Đang khởi chạy ngrok theo CMD_NGROK: ${command}`);

    const child = spawn(executable, args, {
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.ngrokProcess = child;

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        this.logger.warn(`[ngrok] ${text}`);
      }
    });

    child.on('error', (error: Error) => {
      this.logger.warn(`Không thể khởi chạy ngrok: ${error.message}`);
      if (this.ngrokProcess === child) {
        this.ngrokProcess = null;
      }
    });

    child.on('exit', (code: number | null) => {
      if (!this.isShuttingDown && code !== 0 && code !== null) {
        this.logger.warn(`Tiến trình ngrok đã dừng với mã thoát ${code}.`);
      }
      if (this.ngrokProcess === child) {
        this.ngrokProcess = null;
      }
    });

    this.verifyTimer = setTimeout(() => {
      void this.logStartedTunnel();
    }, 2500);
  }

  private resolveCommand(command: string): {
    executable: string;
    args: string[];
    useShell: boolean;
  } {
    const cleaned = Array.from(
      command.matchAll(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g),
      (match) => match[0].replace(/^["']|["']$/g, ''),
    );
    const rawExe = cleaned[0] ?? command;
    const args = cleaned.slice(1);

    if (process.platform === 'win32' && rawExe.toLowerCase() === 'ngrok') {
      try {
        const whereOutput = execFileSync('where', ['ngrok'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        });
        const candidates = whereOutput
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const exeCandidate = candidates.find(
          (line) => line.toLowerCase().endsWith('.exe') && existsSync(line),
        );
        if (exeCandidate) {
          return { executable: exeCandidate, args, useShell: false };
        }
      } catch {
        // Giữ nguyên fallback shell nếu không tìm được file .exe qua where
      }
    }

    return { executable: command, args: [], useShell: true };
  }

  private async logStartedTunnel(): Promise<void> {
    if (this.isShuttingDown) return;
    const urls = await this.getActiveTunnelUrls();
    if (urls.length > 0) {
      this.logger.log(`Ngrok tunnel đã sẵn sàng: ${urls.join(', ')}`);
    }
  }

  private async getActiveTunnelUrls(): Promise<string[]> {
    try {
      const response = await fetch(NGROK_INSPECTOR_API, {
        signal: AbortSignal.timeout(800),
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        tunnels?: Array<{ public_url?: string }>;
      };
      return (payload.tunnels ?? [])
        .map((tunnel) => tunnel.public_url)
        .filter((url): url is string => Boolean(url));
    } catch {
      return [];
    }
  }

  private stopTunnelProcess(): void {
    this.isShuttingDown = true;

    if (this.verifyTimer) {
      clearTimeout(this.verifyTimer);
      this.verifyTimer = null;
    }

    const child = this.ngrokProcess;
    if (!child || !child.pid) {
      return;
    }

    this.ngrokProcess = null;
    const pid = child.pid;

    try {
      if (process.platform === 'win32') {
        // Trên Windows cần diệt cả cây tiến trình để tránh ngrok.exe chạy mồ côi khi dùng shell
        execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      } else {
        child.kill('SIGTERM');
      }
      this.logger.log('Đã tắt tiến trình con ngrok.');
    } catch {
      // Bỏ qua nếu tiến trình ngrok đã thoát trước đó
    }
  }
}
