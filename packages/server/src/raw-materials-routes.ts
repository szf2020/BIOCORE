// ============================================================
// raw-materials-routes.ts — 原料库 M9 路由 (Sprint 2 M2.6)
//
// 提供 7 个端点:
//   GET    /raw-materials              — 列表 (可按 category 过滤)
//   GET    /raw-materials/:id          — 详情
//   POST   /raw-materials              — 创建
//   PUT    /raw-materials/:id          — 更新 (partial)
//   DELETE /raw-materials/:id          — 软删除
//   POST   /raw-materials/:id/msds     — 上传 MSDS PDF
//   GET    /raw-materials/:id/msds     — 下载 MSDS PDF
//
// 安全要点:
//   - fileFilter 检查 mimetype === 'application/pdf'
//   - 单文件上传完成后再验 magic bytes 前 4 字节 `25 50 44 46` (%PDF)
//   - limits.fileSize = 20MB
//   - 文件名 `${material_id}_${Date.now()}.pdf`, 杜绝用户输入进文件系统
// ============================================================

import { Router } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { customAlphabet } from 'nanoid';

// 21 字符安全字母表 (去掉相似字符 0/O/1/l/I)
const nano = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 8);

const VALID_CATEGORIES = new Set(['media', 'buffer', 'reagent', 'substrate', 'additive', 'other']);

export function registerRawMaterialsRoutes(router: Router, sqlite: any, dataDir: string) {
  const msdsDir = path.join(dataDir, 'uploads', 'msds');
  fs.mkdirSync(msdsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, msdsDir),
    filename: (req, _file, cb) => {
      const materialId = (req.params?.id || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!materialId) return cb(new Error('missing material_id'), '');
      cb(null, `${materialId}_${Date.now()}.pdf`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype !== 'application/pdf') {
        return cb(new Error('仅允许上传 PDF'));
      }
      cb(null, true);
    },
  });

  /**
   * @openapi
   * /raw-materials:
   *   get:
   *     summary: 列表原料 (支持 category 过滤, 软删除后不返回)
   *     tags: [RawMaterials]
   *     parameters:
   *       - in: query
   *         name: category
   *         schema: { type: string, enum: [media, buffer, reagent, substrate, additive, other] }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 200, maximum: 1000 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200: { description: 原料列表 (含 physical_properties JSON 解析后的对象) }
   */
  router.get('/raw-materials', (req, res) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const limit = parseInt(String(req.query.limit ?? '200'), 10);
      const offset = parseInt(String(req.query.offset ?? '0'), 10);
      res.json(sqlite.listRawMaterials({ category, limit, offset }));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * @openapi
   * /raw-materials/{id}:
   *   get:
   *     summary: 获取原料详情
   *     tags: [RawMaterials]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, example: "RM-ABC23xyz" }
   *     responses:
   *       200: { description: 原料详情 }
   *       404: { description: 不存在或已删除 }
   */
  router.get('/raw-materials/:id', (req, res) => {
    const m = sqlite.getRawMaterial(req.params.id);
    if (!m) return res.status(404).json({ error: '原料不存在' });
    res.json(m);
  });

  /**
   * @openapi
   * /raw-materials:
   *   post:
   *     summary: 创建新原料 (material_id 服务端生成 RM-nanoid)
   *     tags: [RawMaterials]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, category]
   *             properties:
   *               name:          { type: string, example: "酵母粉" }
   *               category:      { type: string, enum: [media, buffer, reagent, substrate, additive, other] }
   *               supplier:      { type: string }
   *               catalog_no:    { type: string }
   *               unit:          { type: string, example: "kg" }
   *               cost_per_unit: { type: number }
   *               storage:       { type: string, example: "4°C" }
   *               physical_properties:
   *                 type: object
   *                 properties:
   *                   density: { type: number }
   *                   viscosity_curve: { type: array, items: { type: array, items: { type: number } } }
   *                   pH_range: { type: array, items: { type: number } }
   *                   operating_temp_range: { type: array, items: { type: number } }
   *               notes: { type: string }
   *     responses:
   *       201: { description: 创建成功, 返回 material_id }
   *       400: { description: 参数不合法 }
   */
  router.post('/raw-materials', (req: any, res) => {
    try {
      const { name, category } = req.body || {};
      if (!name || !category) return res.status(400).json({ error: '缺少 name 或 category' });
      if (!VALID_CATEGORIES.has(category)) {
        return res.status(400).json({ error: `非法 category, 合法值: ${[...VALID_CATEGORIES].join('/')}` });
      }
      const material_id = `RM-${nano()}`;
      sqlite.createRawMaterial({
        ...req.body,
        material_id,
        created_by: req.user?.user_id || 'anonymous',
      });
      res.status(201).json({ success: true, material_id });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * @openapi
   * /raw-materials/{id}:
   *   put:
   *     summary: 更新原料 (partial, 仅传要改的字段)
   *     tags: [RawMaterials]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: 更新成功 }
   *       404: { description: 不存在 }
   */
  router.put('/raw-materials/:id', (req, res) => {
    try {
      const existing = sqlite.getRawMaterial(req.params.id);
      if (!existing) return res.status(404).json({ error: '原料不存在' });
      if (req.body.category && !VALID_CATEGORIES.has(req.body.category)) {
        return res.status(400).json({ error: `非法 category, 合法值: ${[...VALID_CATEGORIES].join('/')}` });
      }
      sqlite.updateRawMaterial(req.params.id, req.body);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  /**
   * @openapi
   * /raw-materials/{id}:
   *   delete:
   *     summary: 软删除原料 (标记 deleted_at, 保留 DB 行与 MSDS 文件)
   *     tags: [RawMaterials]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: 删除成功 }
   *       404: { description: 不存在 }
   */
  router.delete('/raw-materials/:id', (req, res) => {
    const existing = sqlite.getRawMaterial(req.params.id);
    if (!existing) return res.status(404).json({ error: '原料不存在' });
    sqlite.softDeleteRawMaterial(req.params.id);
    res.json({ success: true });
  });

  /**
   * @openapi
   * /raw-materials/{id}/msds:
   *   post:
   *     summary: 上传 MSDS PDF (multipart/form-data, field="file")
   *     tags: [RawMaterials]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file: { type: string, format: binary }
   *     responses:
   *       200: { description: 上传成功, 返回 filename }
   *       400: { description: 非 PDF / 文件损坏 }
   *       413: { description: 文件超过 20MB }
   */
  router.post('/raw-materials/:id/msds', (req, res, next) => {
    // 确认材料存在
    const existing = sqlite.getRawMaterial(req.params.id);
    if (!existing) return res.status(404).json({ error: '原料不存在' });
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '文件超过 20MB' });
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) return res.status(400).json({ error: '缺少文件' });
      // Magic bytes 校验前 4 字节 = `%PDF` (25 50 44 46)
      try {
        const fd = fs.openSync(req.file.path, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: '文件不是合法 PDF (magic bytes 校验失败)' });
        }
      } catch (e) {
        return res.status(500).json({ error: '文件校验失败: ' + (e as Error).message });
      }
      sqlite.setMsdsFilename(req.params.id, req.file.filename);
      res.json({ success: true, filename: req.file.filename });
    });
  });

  /**
   * @openapi
   * /raw-materials/{id}/msds:
   *   get:
   *     summary: 下载 MSDS PDF
   *     tags: [RawMaterials]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: PDF 文件流
   *         content:
   *           application/pdf:
   *             schema: { type: string, format: binary }
   *       404: { description: 原料不存在或未上传 MSDS }
   */
  router.get('/raw-materials/:id/msds', (req, res) => {
    const m = sqlite.getRawMaterial(req.params.id);
    if (!m) return res.status(404).json({ error: '原料不存在' });
    if (!m.msds_filename) return res.status(404).json({ error: '未上传 MSDS' });
    const filePath = path.join(msdsDir, m.msds_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'MSDS 文件丢失' });
    res.download(filePath, m.msds_filename);
  });
}
