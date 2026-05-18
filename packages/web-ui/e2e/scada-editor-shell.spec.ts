import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

const API_BASE = process.env.E2E_API_URL || 'http://localhost:3001';

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  const body = await r.json();
  return body.data.token as string;
}

async function seedView(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  const id = `v_smoke_${Date.now()}`;
  const payload = {
    id, name: 'smoke', type: 'svg' as const, svgcontent: '<svg/>',
    width: 800, height: 600,
    items: {},
    schemaVersion: 1 as const,
  };
  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: { id, name: 'smoke', type: 'svg', payload, width: 800, height: 600 },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedView failed: ${r.status()} ${await r.text()}`);
  return id;
}

test.describe('SP-FX-4 — editor shell smoke', () => {
  let viewId: string;

  test.beforeEach(async ({ page, request }) => {
    await login(page);
    viewId = await seedView(request);
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });
  });

  async function dropPaletteItem(page: Page, itemType: string, cx: number, cy: number) {
    await page.evaluate(
      ({ type, cx: x, cy: y }) => {
        const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement | null;
        if (!host) throw new Error('canvas host not found');
        // Access React fiber to invoke onDrop directly (bypasses dataTransfer serialization limits)
        const fiberKey = Object.keys(host).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) throw new Error('React fiber not found on canvas host');
        let fiber = (host as any)[fiberKey];
        let onDrop: ((e: any) => void) | null = null;
        for (let i = 0; i < 10 && fiber; i++) {
          if (fiber.pendingProps?.onDrop) { onDrop = fiber.pendingProps.onDrop; break; }
          if (fiber.memoizedProps?.onDrop) { onDrop = fiber.memoizedProps.onDrop; break; }
          fiber = fiber.return || fiber.child;
        }
        if (!onDrop) throw new Error('onDrop not found in React fiber');
        const dt = new DataTransfer();
        dt.setData('palette-item', type);
        onDrop({ preventDefault: () => {}, dataTransfer: dt, currentTarget: host, clientX: x, clientY: y });
      },
      { type: itemType, cx, cy },
    );
    await page.waitForTimeout(150);
  }

  test('palette rect dragTo canvas → widget appears → save', async ({ page }) => {
    const canvasBox = await page.locator('[data-editor-canvas-host]').boundingBox();
    if (!canvasBox) throw new Error('canvas host not found');
    await dropPaletteItem(page, 'rect', canvasBox.x + 200, canvasBox.y + 150);
    await page.waitForTimeout(300);
    const widgetCount = await page.locator('[data-widget-id]').count();
    expect(widgetCount).toBeGreaterThanOrEqual(1);
    await page.locator('[data-cmd="save"]').click();
    await page.waitForTimeout(500);
  });

  test('undo/redo via toolbar buttons', async ({ page }) => {
    const canvasBox = await page.locator('[data-editor-canvas-host]').boundingBox();
    if (!canvasBox) throw new Error('canvas host not found');
    await dropPaletteItem(page, 'rect', canvasBox.x + 200, canvasBox.y + 150);
    await dropPaletteItem(page, 'rect', canvasBox.x + 350, canvasBox.y + 250);
    expect(await page.locator('[data-widget-id]').count()).toBe(2);
    await page.locator('[data-cmd="undo"]').click();
    await page.waitForTimeout(200);
    expect(await page.locator('[data-widget-id]').count()).toBe(1);
    await page.locator('[data-cmd="redo"]').click();
    await page.waitForTimeout(200);
    expect(await page.locator('[data-widget-id]').count()).toBe(2);
  });

  test('Cmd+S triggers PUT save', async ({ page }) => {
    const canvasBox = await page.locator('[data-editor-canvas-host]').boundingBox();
    if (!canvasBox) throw new Error('canvas host not found');
    await dropPaletteItem(page, 'rect', canvasBox.x + 200, canvasBox.y + 150);
    const putPromise = page.waitForRequest((req) =>
      req.method() === 'PUT' && req.url().includes(`/api/v1/fuxa-views/${viewId}`),
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+s');
    const req = await putPromise;
    expect(req.method()).toBe('PUT');
  });
});
