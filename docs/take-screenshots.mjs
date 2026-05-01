/**
 * BIOCore 截图脚本 — 用于 PPT 素材
 * 使用: npx playwright test --config=... 或 node take-screenshots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = 'http://localhost:3000';
const API  = 'http://localhost:3001';
const OUT  = './screenshots';
const WIDTH = 1920;
const HEIGHT = 1080;

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/kris/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe',
  });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2, // 高清截图
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // 1. 登录页
  console.log('1. 登录页...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/01_login.png`, fullPage: false });

  // 登录
  console.log('   登录中...');
  try {
    await page.fill('input[name="username"], input[type="text"]', 'admin');
    await page.fill('input[name="password"], input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('   登录表单未找到，尝试直接访问...');
  }

  // 2. Dashboard 主控台
  console.log('2. Dashboard...');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02_dashboard.png`, fullPage: false });

  // Dashboard 全页
  await page.screenshot({ path: `${OUT}/02_dashboard_full.png`, fullPage: true });

  // 3. 配方列表
  console.log('3. 配方管理...');
  await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03_recipes.png`, fullPage: false });

  // 4. 配方编辑器 (DAG)
  console.log('4. 配方编辑器...');
  // 尝试找到第一个配方并编辑
  try {
    const editLink = await page.$('a[href*="/edit"]');
    if (editLink) {
      await editLink.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/04_recipe_editor.png`, fullPage: false });
    }
  } catch (e) {
    console.log('   配方编辑器跳过');
  }

  // 5. 批次历史
  console.log('5. 批次历史...');
  await page.goto(`${BASE}/batches`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/05_batches.png`, fullPage: false });

  // 6. 数据浏览器
  console.log('6. 数据浏览器...');
  await page.goto(`${BASE}/explorer`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06_explorer.png`, fullPage: false });

  // 7. KPI 仪表盘
  console.log('7. KPI 仪表盘...');
  await page.goto(`${BASE}/analysis/kpi`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/07_kpi.png`, fullPage: false });

  // 8. SPC 控制图
  console.log('8. SPC 控制图...');
  await page.goto(`${BASE}/analysis/spc`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/08_spc.png`, fullPage: false });

  // 9. 原材料管理
  console.log('9. 原材料...');
  await page.goto(`${BASE}/analysis/raw-materials`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/09_raw_materials.png`, fullPage: false });

  // 10. 审计日志
  console.log('10. 审计日志...');
  await page.goto(`${BASE}/analysis/audit-logs`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/10_audit_logs.png`, fullPage: false });

  // 11. PLC 配置
  console.log('11. PLC 配置...');
  await page.goto(`${BASE}/settings/plc-config`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/11_plc_config.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/11_plc_config_full.png`, fullPage: true });

  // 12. 设备配置
  console.log('12. 设备配置...');
  await page.goto(`${BASE}/settings/device-config`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/12_device_config.png`, fullPage: false });

  // 13. 设置页面
  console.log('13. 设置...');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/13_settings.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/13_settings_full.png`, fullPage: true });

  await browser.close();
  console.log(`\n完成! 截图保存在 ${OUT}/`);
}

main().catch(e => {
  console.error('截图脚本出错:', e.message);
  process.exit(1);
});
