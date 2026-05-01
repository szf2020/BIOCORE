import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

const { execFileSync } = await import('child_process');
const { spawn } = await import('child_process');

const tsx = join(__dirname, 'node_modules', '.bin', 'tsx.CMD');
const child = spawn(tsx, ['watch', 'src/index.ts'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code));
