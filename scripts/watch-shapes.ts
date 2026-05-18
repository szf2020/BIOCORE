import chokidar from 'chokidar';
import { copyFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { genCatalog } from './gen-shape-catalog';

const SRC_DIR = join(__dirname, '../packages/web-ui/src/scada-engine/assets/shapes');
const PUB_DIR = join(__dirname, '../packages/web-ui/public/scada-shapes');
const OUT_FILE = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts',
);
const CATS_FILE = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/assets/shape-categories.json',
);

let debounceTimer: NodeJS.Timeout | null = null;

function syncMirror(): void {
  if (!existsSync(PUB_DIR)) mkdirSync(PUB_DIR, { recursive: true });
  const srcSet = new Set(readdirSync(SRC_DIR).filter((f) => f.endsWith('.svg')));
  for (const f of readdirSync(PUB_DIR)) {
    if (f.endsWith('.svg') && !srcSet.has(f)) unlinkSync(join(PUB_DIR, f));
  }
  for (const f of srcSet) {
    copyFileSync(join(SRC_DIR, f), join(PUB_DIR, f));
  }
}

function regen(): void {
  syncMirror();
  const { count } = genCatalog(SRC_DIR, OUT_FILE, CATS_FILE);
  // eslint-disable-next-line no-console
  console.log(`[shape-watch] synced ${count} shapes`);
}

function schedule(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(regen, 200);
}

const watcher = chokidar.watch(join(SRC_DIR, '*.svg'), { ignoreInitial: false });
watcher.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log(`[shape-watch] watching ${SRC_DIR}`);
  regen();
});
watcher.on('add', schedule);
watcher.on('change', schedule);
watcher.on('unlink', schedule);
