import type { Express } from 'express';
import type { Pool } from 'pg';
import { makeFragment } from '@slidebi/presentation';
import { authorizeAssets, fail, getSlide, id, transaction } from './db.ts';

const view = (row: any) => ({
  id: row.id, name: row.name, tags: row.tags, spec: row.spec,
  sourceSlideId: row.source_slide_id, sourceRevision: row.source_revision,
  createdAt: row.created_at,
});
function validate(input: unknown) {
  const invalid = () => fail(422, 'INVALID_FRAGMENT', '请选择已保存页面的对象，填写1–200字名称及最多12个标签（每个1–50字）');
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !['slideId', 'revision', 'elementIds', 'name', 'tags'].includes(key))) return invalid();
  if (typeof body.slideId !== 'string' || !body.slideId || body.slideId.length > 200 || !Number.isInteger(body.revision) || Number(body.revision) < 1) return invalid();
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200) return invalid();
  if (!Array.isArray(body.tags) || body.tags.length > 12 || body.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 50)) return invalid();
  if (!Array.isArray(body.elementIds) || !body.elementIds.length || body.elementIds.length > 50 || body.elementIds.some(value => typeof value !== 'string' || !value || value.length > 200) || new Set(body.elementIds).size !== body.elementIds.length) return invalid();
  return { slideId: body.slideId, revision: Number(body.revision), name: body.name.trim(), tags: [...new Set((body.tags as string[]).map(tag => tag.trim()))], elementIds: body.elementIds as string[] };
}

/** Personal library only: no invented team identity, publication or permissions. */
export function registerFragmentRoutes(app: Express, pool: Pool, actor: number): void {
  app.post('/api/fragments', async (req, res) => {
    const input = validate(req.body);
    const result = await transaction(pool, async db => {
      const slide = await getSlide(db, Number(actor), input.slideId, input.revision);
      let spec: ReturnType<typeof makeFragment>;
      try { spec = makeFragment(slide, input.elementIds); }
      catch { fail(422, 'INVALID_FRAGMENT_SELECTION', '所选对象不存在，或数据绑定不完整，请重新选择'); }
      await authorizeAssets(db, Number(actor), spec);
      // Copy layout/binding instructions only. The referenced slide revision is
      // immutable; no data snapshot, business result rows or source IDs are copied.
      const row = (await db.query('INSERT INTO app.fragments(id,owner_id,name,tags,spec,source_slide_id,source_revision) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [id('fragment'), Number(actor), input.name, input.tags, spec, slide.id, slide.revision])).rows[0];
      return view(row);
    });
    res.status(201).json(result);
  });
  app.get('/api/fragments', async (_req, res) => {
    const rows = (await pool.query('SELECT * FROM app.fragments WHERE owner_id=$1 AND archived_at IS NULL ORDER BY created_at DESC,id', [Number(actor)])).rows;
    res.json({ items: rows.map(view) });
  });
  app.get('/api/fragments/:id', async (req, res) => {
    const row = (await pool.query('SELECT * FROM app.fragments WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL', [req.params.id, Number(actor)])).rows[0];
    if (!row) fail(404, 'NOT_FOUND', '片段不存在');
    res.json(view(row));
  });
  app.post('/api/fragments/:id/archive', async (req, res) => {
    const row = (await pool.query('UPDATE app.fragments SET archived_at=COALESCE(archived_at,now()) WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, Number(actor)])).rows[0];
    if (!row) fail(404, 'NOT_FOUND', '片段不存在');
    res.json({ id: row.id, archived: true });
  });
}
