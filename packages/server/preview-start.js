// preview-start.js — 用于 Claude Preview 的启动脚本
// 设置正确的工作目录后 spawn tsx watch
const { spawn } = require('child_process');
const path = require('path');

const serverDir = path.resolve(__dirname);
process.chdir(serverDir);

console.log('[preview-start] cwd:', process.cwd());
console.log('[preview-start] PORT env:', process.env.PORT);

const child = spawn(
  process.execPath, // node 自身
  ['--import', 'tsx', 'src/index.ts'],
  {
    cwd: serverDir,
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || '3001' },
  }
);

child.on('error', (err) => {
  console.error('[preview-start] spawn error:', err);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
