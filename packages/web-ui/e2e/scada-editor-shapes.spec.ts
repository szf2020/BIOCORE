import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';
const API_BASE = process.env.E2E_API_URL || 'http://localhost:3001';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

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

async function dropPaletteShape(page: Page, shapeId: string, src: string, cx: number, cy: number) {
  await page.evaluate(
    ({ shapeId: id, src: s, cx: x, cy: y }) => {
      const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement | null;
      if (!host) throw new Error('canvas host not found');
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
      dt.setData('palette-shape', JSON.stringify({ id, src: s }));
      onDrop({ preventDefault: () => {}, dataTransfer: dt, currentTarget: host, clientX: x, clientY: y });
    },
    { shapeId, src, cx, cy },
  );
  await page.waitForTimeout(150);
}

test.describe('SP-FX-5 — editor shape smoke', () => {
  let viewId: string;

  test.beforeEach(async ({ page, request }) => {
    await login(page);
    viewId = await seedView(request);
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-editor-canvas-host]', { timeout: 10_000 });
    await page.waitForSelector('[data-panel="shape-picker"]', { timeout: 10_000 });
  });

  test('shape drag onto canvas → <image> appears → save', async ({ page }) => {
    const firstShape = page.locator('[data-palette-shape]').first();
    const shapeId = await firstShape.getAttribute('data-palette-shape');
    expect(shapeId).toBeTruthy();
    const src = `/scada-shapes/${shapeId}.svg`;

    const canvasBox = await page.locator('[data-editor-canvas-host]').boundingBox();
    if (!canvasBox) throw new Error('canvas host not found');
    await dropPaletteShape(page, shapeId!, src, canvasBox.x + 200, canvasBox.y + 150);
    await page.waitForTimeout(300);

    const imgCount = await page.locator(`[data-editor-canvas-host] image[data-widget-id]`).count();
    expect(imgCount).toBeGreaterThanOrEqual(1);

    const putPromise = page.waitForRequest((req) =>
      req.method() === 'PUT' && req.url().includes(`/api/v1/fuxa-views/${viewId}`),
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+s');
    const req = await putPromise;
    expect(req.method()).toBe('PUT');
  });

  test('shape select shows transform handles', async ({ page }) => {
    const firstShape = page.locator('[data-palette-shape]').first();
    const shapeId = await firstShape.getAttribute('data-palette-shape');
    const src = `/scada-shapes/${shapeId}.svg`;

    const canvasBox = await page.locator('[data-editor-canvas-host]').boundingBox();
    if (!canvasBox) throw new Error('canvas host not found');
    await dropPaletteShape(page, shapeId!, src, canvasBox.x + 200, canvasBox.y + 150);
    await page.waitForTimeout(300);

    const img = page.locator(`[data-editor-canvas-host] image[data-widget-id]`).first();
    await img.click();
    await page.waitForTimeout(200);

    const handlesCount = await page.locator('[data-handle], [data-overlay="handles"]').count();
    expect(handlesCount).toBeGreaterThanOrEqual(1);
  });
});
