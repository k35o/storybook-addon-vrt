import { spawn } from 'node:child_process';

export function openInBrowser(filePath: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [filePath]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', filePath]]
        : ['xdg-open', [filePath]];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}
