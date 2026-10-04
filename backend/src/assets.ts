import type { Express } from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { bytesHash, fail, HttpError, id, transaction } from './db.ts';
import { validateStaticSvg } from './assets-svg.ts';
import { processAssetImage } from './image-processing.ts';
import { ASSET_FOLDERS } from './catalog-structure.ts';
import { validateBuiltinAssetManifest, type BuiltinAssetManifest } from './asset-manifest.ts';

type NormalizedAssetImage = {png:Buffer;original:Buffer;originalMime:'image/svg+xml'|'image/jpeg'|'image/png'};

export async function normalizeAssetImage(input: Buffer):Promise<NormalizedAssetImage> {
  const pngMagic = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpegMagic = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const isSvg = !pngMagic && !jpegMagic;
  if (isSvg) validateStaticSvg(input);
  try {
    const img = sharp(input, { limitInputPixels: 20000000, ...(isSvg ? { density: 144 } : {}) });
    const m = await img.metadata();
    if (![isSvg ? 'svg' : 'png', ...(isSvg ? [] : ['jpeg'])].includes(m.format || '')) fail(422, 'UNSUPPORTED_IMAGE', '仅支持 PNG、JPEG 和静态 SVG');
    const output = isSvg ? img.resize({ width: 1024, height: 1024, fit: 'inside' }) : img.rotate();
    return { png: await output.png().toBuffer(), original: input, originalMime: isSvg ? 'image/svg+xml' : jpegMagic ? 'image/jpeg' : 'image/png' };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(422, 'INVALID_IMAGE', '图片无法解码，或尺寸超过限制');
  }
}

// App instances are created repeatedly by integration tests and local hot reloads.
// Cache immutable built-in previews by their verified source hash so each process
// rasterizes a bundled SVG only once.
const builtinPreviewCache=new Map<string,Promise<NormalizedAssetImage>>();
function normalizeBuiltinAsset(input:Buffer,sha256:string):Promise<NormalizedAssetImage>{
  const cached=builtinPreviewCache.get(sha256);
  if(cached)return cached;
  const pending=normalizeAssetImage(input);
  builtinPreviewCache.set(sha256,pending);
  pending.catch(()=>builtinPreviewCache.delete(sha256));
  return pending;
}
function metadata(name: unknown, rawTags: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) fail(422, 'INVALID_ASSET_NAME', '名称需为1至200字');
  if (!Array.isArray(rawTags) || rawTags.length > 12 || rawTags.some(x => typeof x !== 'string' || !x.trim() || x.trim().length > 50)) fail(422, 'INVALID_ASSET_TAGS', '标签最多12项，每项1至50字');
  return { name: name.trim(), tags: [...new Set(rawTags.map(x => x.trim()))] };
}
function uploadFilename(name: string): string {
  // Browsers send UTF-8 filename bytes, but Busboy's default parameter charset
  // is Latin-1. Only reinterpret a byte-preserving string with valid UTF-8;
  // decoded Unicode and genuine non-UTF-8 filenames must remain unchanged.
  if ([...name].some(char => char.codePointAt(0)! > 255)) return name;
  const bytes = Buffer.from(name, 'latin1');
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : name;
  } catch { return name; }
}
const view = (a: any, actor?:number) => ({ ownerId:a.owner_id,canEdit:Number(a.owner_id)===Number(actor),visibility:a.visibility,folderId:a.folder_id, id: a.id, name: a.name, kind: a.kind, mime: a.mime_type, url: `/api/assets/${a.id}/file`, originalMime: a.source_mime || a.mime_type, originalUrl: `/api/assets/${a.id}/original`, tags: a.tags, builtin: a.id.startsWith('builtin-'), source: a.provenance, favorite: !!a.favorite });
const projection = 'SELECT a.*,o.mime_type,s.mime_type AS source_mime FROM app.assets a JOIN app.storage_objects o ON o.id=a.original_object_id LEFT JOIN app.storage_objects s ON s.id=a.source_object_id';
async function materialize(storageDir: string, bytes: Buffer, ext: string) {
  const key = `assets/${bytesHash(bytes)}.${ext}`;
  try { await writeFile(path.join(storageDir, key), bytes, { flag: 'wx' }); } catch (error: any) { if (error.code !== 'EEXIST') throw error; }
  return key;
}
async function materializeAsset(storageDir:string,image:NormalizedAssetImage){
  const pngKey = await materialize(storageDir, image.png, 'png');
  const originalKey = await materialize(storageDir, image.original, image.originalMime === 'image/svg+xml' ? 'svg' : image.originalMime === 'image/jpeg' ? 'jpg' : 'png');
  return {pngKey,originalKey};
}
async function persist(pool: Pool, storageDir: string, input: Buffer, data: { id: string; owner: number | null; name: string; tags: string[]; kind: string; folderId?: string | null; source?: unknown }, normalized?:NormalizedAssetImage) {
  const image = normalized??await normalizeAssetImage(input);
  const {pngKey,originalKey}=await materializeAsset(storageDir,image);
  await transaction(pool, async db => {
    const object = async (key: string, bytes: Buffer, mime: string) => {
      await db.query('INSERT INTO app.storage_objects(storage_key,sha256,mime_type,byte_size) VALUES($1,$2,$3,$4) ON CONFLICT(storage_key) DO NOTHING', [key, bytesHash(bytes), mime, bytes.length]);
      return (await db.query('SELECT id FROM app.storage_objects WHERE storage_key=$1', [key])).rows[0].id;
    };
    const pngObject = await object(pngKey, image.png, 'image/png');
    const originalObject = await object(originalKey, image.original, image.originalMime);
    await db.query('INSERT INTO app.assets(id,owner_id,visibility,name,kind,folder_id,original_object_id,source_object_id,tags,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING', [data.id, data.owner ?? (await db.query("SELECT id FROM app.users WHERE username='marx'")).rows[0].id, data.owner === null ? 'public' : 'private', data.name, data.kind, data.folderId ?? null, pngObject, originalObject, data.tags, data.source || {}]);
  });
}
export async function registerAssetRoutes(app: Express, pool: Pool, actor: number, storageDir: string) {
  await mkdir(path.join(storageDir, 'assets'), { recursive: true });
  const manifest: BuiltinAssetManifest = JSON.parse(await readFile(new URL('../fixtures/assets/manifest.json', import.meta.url), 'utf8'));
  const manifestErrors = validateBuiltinAssetManifest(manifest, ASSET_FOLDERS);
  if (manifestErrors.length) throw new Error(`Builtin asset manifest is invalid: ${manifestErrors.join('; ')}`);
  const existingBuiltinIds=new Set((await pool.query('SELECT id FROM app.assets WHERE id=ANY($1::text[])',[manifest.items.map(item=>item.id)])).rows.map(row=>row.id));
  for (const item of manifest.items) {
    // Materialize into each app's storage root, even when the DB is already seeded.
    const bytes = await readFile(new URL(`../fixtures/assets/${item.file}`, import.meta.url));
    if (bytesHash(bytes) !== item.source.sha256) throw new Error(`Builtin asset checksum mismatch: ${item.file}`);
    const normalized=await normalizeBuiltinAsset(bytes,item.source.sha256);
    if(existingBuiltinIds.has(item.id))await materializeAsset(storageDir,normalized);
    else await persist(pool, storageDir, bytes, { ...item, owner: null },normalized);
  }
  async function get(aid: string, embedded = false) {
    const a = (await pool.query(`${projection} WHERE a.id=$1 AND (a.owner_id=$2 OR a.visibility IN ('builtin','public') OR ($3 AND (EXISTS(SELECT 1 FROM app.slide_asset_refs ar JOIN app.slides s ON s.id=ar.slide_id LEFT JOIN app.decks d ON d.id=s.content_deck_id WHERE ar.asset_id=a.id AND s.archived_at IS NULL AND (s.owner_id=$2 OR (d.visibility='public' AND d.archived_at IS NULL AND ar.revision=s.current_revision))) OR EXISTS(SELECT 1 FROM app.template_asset_refs ar JOIN app.templates t ON t.id=ar.template_id WHERE ar.asset_id=a.id AND t.archived_at IS NULL AND (t.owner_id=$2 OR (t.visibility='public' AND ar.template_version=(SELECT max(v.version) FROM app.template_versions v WHERE v.template_id=t.id)))))))`, [aid, Number(actor),embedded])).rows[0];
    if (!a) fail(404, 'NOT_FOUND', '素材不存在');
    return a;
  }
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, fieldSize: 2000 } });
  app.post('/api/assets', upload.single('file'), async (req, res) => {
    if (!req.file) fail(400, 'FILE_REQUIRED', '请选择图片');
    let tags: unknown = [];
    if (req.body.tags !== undefined) { try { tags = JSON.parse(req.body.tags); } catch { fail(422, 'INVALID_ASSET_TAGS', '标签应为JSON数组'); } }
    const meta = metadata(req.body.name ?? path.basename(uploadFilename(req.file.originalname)), tags);
    const kind = req.body.kind ?? 'image';
    if (!['image', 'icon', 'vector'].includes(kind)) fail(422, 'INVALID_ASSET_KIND', '请选择图片、图标或矢量图');
    if(kind==='vector' && (await normalizeAssetImage(req.file.buffer)).originalMime!=='image/svg+xml') fail(422,'INVALID_ASSET_KIND','矢量图请上传 SVG 文件或输入 SVG 代码');
    const aid = id('asset');
    await persist(pool, storageDir, req.file.buffer, { id: aid, owner: Number(actor), kind, ...meta });
    res.status(201).json(view(await get(aid),Number(actor)));
  });
  app.get('/api/assets', async (_req, res) => {
    const rows = (await pool.query(`${projection} WHERE (a.owner_id=$1 OR a.visibility IN ('builtin','public')) AND a.archived_at IS NULL ORDER BY a.created_at DESC,a.id`, [Number(actor)])).rows;
    const favorites = new Set((await pool.query('SELECT asset_id FROM app.asset_favorites WHERE owner_id=$1', [Number(actor)])).rows.map(r => r.asset_id));
    res.json({ items: rows.map(a => view({ ...a, favorite: favorites.has(a.id) },Number(actor))) });
  });
  app.put('/api/assets/:id', async (req, res) => {
    const a = await get(req.params.id); if (Number(a.owner_id)!==Number(Number(actor))) fail(403, 'OWNER_REQUIRED', '仅所有者可修改素材');
    const meta = metadata(req.body.name, req.body.tags);
    await pool.query('UPDATE app.assets SET name=$2,tags=$3 WHERE id=$1 AND owner_id=$4', [a.id, meta.name, meta.tags, Number(actor)]);
    res.json(view(await get(a.id),Number(actor)));
  });
  app.post('/api/assets/:id/archive', async (req, res) => {
    const a = await get(req.params.id); if (Number(a.owner_id)!==Number(Number(actor))) fail(403, 'OWNER_REQUIRED', '仅所有者可修改素材');
    await pool.query('UPDATE app.assets SET archived_at=COALESCE(archived_at,now()) WHERE id=$1 AND owner_id=$2', [a.id, Number(actor)]);
    res.json({ id: a.id, archived: true });
  });
  for (const saveCopy of [false, true]) app.post(`/api/assets/:id/${saveCopy ? 'processed-copies' : 'processing-preview'}`, async (req, res) => {
    const a = await get(req.params.id);
    const object = (await pool.query('SELECT * FROM app.storage_objects WHERE id=$1', [a.original_object_id])).rows[0];
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(422, 'INVALID_IMAGE_PROCESSING', '请提供图片处理参数');
    const { name, ...options } = req.body;
    const meta = saveCopy ? metadata(name ?? `${a.name.slice(0, 194)} · 副本`, a.tags) : undefined;
    let bytes: Buffer;
    try { bytes = await readFile(path.join(storageDir, object.storage_key)); } catch { fail(410, 'ASSET_UNAVAILABLE', '原图片文件不可用'); }
    if (bytesHash(bytes) !== object.sha256) fail(410, 'ASSET_UNAVAILABLE', '原图片校验失败');
    const result = await processAssetImage(bytes, options);
    if (!saveCopy) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.type('image/png').send(result.png); return; }
    const aid = id('asset');
    await persist(pool, storageDir, result.png, { id: aid, owner: Number(actor), name: meta!.name, tags: meta!.tags, kind: a.kind==='vector'?'image':a.kind, source: { ...a.provenance, derivedFrom: a.id, derivedFromSha256: object.sha256, processing: result.processing } });
    res.status(201).json(view(await get(aid),Number(actor)));
  });
  for (const original of [false, true]) app.get(`/api/assets/:id/${original ? 'original' : 'file'}`, async (req, res) => {
    const a = await get(req.params.id,!original);
    const object = (await pool.query('SELECT * FROM app.storage_objects WHERE id=$1', [original ? a.source_object_id || a.original_object_id : a.original_object_id])).rows[0];
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (original) { res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"); res.download(path.join(storageDir, object.storage_key), `${a.id}.${object.mime_type === 'image/svg+xml' ? 'svg' : object.mime_type === 'image/jpeg' ? 'jpg' : 'png'}`); }
    else res.type('image/png').sendFile(path.join(storageDir, object.storage_key));
  });
  for (const method of ['put', 'delete'] as const) app[method]('/api/assets/:id/favorite', async (req, res) => {
    await get(req.params.id);
    if (method === 'put') await pool.query('INSERT INTO app.asset_favorites VALUES($1,$2) ON CONFLICT DO NOTHING', [Number(actor), req.params.id]);
    else await pool.query('DELETE FROM app.asset_favorites WHERE owner_id=$1 AND asset_id=$2', [Number(actor), req.params.id]);
    res.json({ favorite: method === 'put' });
  });
}
