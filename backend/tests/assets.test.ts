import { afterAll, beforeAll, expect, test } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { registerAssetRoutes, normalizeAssetImage } from '../src/assets.ts';
import { createApp } from '../src/app.ts';
import { fixture } from '../src/db.ts';
import { writePptx } from '../src/export/pptx.ts';
import JSZip from 'jszip';

const safeSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60" viewBox="0 0 80 60"><path fill="#2563eb" d="M0 0h80v60H0z"/></svg>';
test('static SVG produces PNG while preserving the safe original', async () => {
  const image = await normalizeAssetImage(Buffer.from(safeSVG));
  expect(image.originalMime).toBe('image/svg+xml');
  expect(image.original.toString()).toBe(safeSVG);
  expect((await sharp(image.png).metadata()).format).toBe('png');
});
test.each([
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
  '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.com/a)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:red"/></svg>',
  '<!DOCTYPE svg [<!ENTITY external SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&external;</svg>',
  '<?xml-stylesheet href="https://example.com/x.css"?><svg xmlns="http://www.w3.org/2000/svg"/>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path></svg>',
  '<svg xmlns="http://evil.example/svg"/>',
  '<svg xmlns="http://www.w3.org/2000/svg"><use href="#shape"/></svg>',
])('rejects active, external, unsupported or malformed SVG: %s', async svg => {
  await expect(normalizeAssetImage(Buffer.from(svg))).rejects.toMatchObject({ status: 422 });
});

const pool = new Pool({ connectionString: 'postgresql://slidebi_app@localhost:5432/slidebi_test' });
let storageDir: string;
async function appFor(actor: number, dir = storageDir) {
  const app = express(); app.use(express.json());
  await registerAssetRoutes(app, pool, actor, dir);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ code: error.code, message: error.message }));
  return app;
}
async function user() {
  return Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'assets') RETURNING id", [randomUUID()])).rows[0].id);
}
beforeAll(async () => { storageDir = await mkdtemp(path.join(os.tmpdir(), 'slidebi-assets-test-')); });
afterAll(async () => { await pool.end(); await rm(storageDir, { recursive: true, force: true }); });
test('upload, metadata, owner isolation, builtin readonly, archive and independent offline seed storage', async () => {
  const app = await appFor(await user());
  const otherDir = await mkdtemp(path.join(os.tmpdir(), 'slidebi-assets-other-'));
  try {
    const other = await appFor(await user(), otherDir);
    const uploaded = await request(app).post('/api/assets').field('name', ' 安全图标 ').field('kind', 'icon').field('tags', '["业务","业务"," SVG "]').attach('file', Buffer.from(safeSVG), 'chart.svg');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({ name: '安全图标', kind: 'icon', tags: ['业务', 'SVG'], builtin: false, mime: 'image/png', originalMime: 'image/svg+xml' });
    const a = uploaded.body;
    const preview = await request(app).get(a.url); expect(preview.status).toBe(200); expect(preview.headers['content-type']).toContain('image/png');
    const original = await request(app).get(a.originalUrl); expect(original.status).toBe(200); expect(original.headers['content-disposition']).toContain('attachment');
    expect((await request(other).get(a.url)).status).toBe(404);
    expect((await request(other).put(`/api/assets/${a.id}`).send({ name: '偷改', tags: [] })).status).toBe(404);
    expect((await request(other).post(`/api/assets/${a.id}/archive`)).status).toBe(404);
    const edited = await request(app).put(`/api/assets/${a.id}`).send({ name: '收入图标', tags: ['销售'] });
    expect(edited.status).toBe(200); expect(edited.body.tags).toEqual(['销售']);
    expect((await request(app).post(`/api/assets/${a.id}/archive`)).status).toBe(200);
    expect((await request(app).get('/api/assets')).body.items.some((x: any) => x.id === a.id)).toBe(false);
    expect((await request(app).get(a.url)).status).toBe(200);
    const builtin = (await request(app).get('/api/assets')).body.items.filter((x: any) => x.builtin);
    expect(builtin.filter((x: any) => x.kind === 'icon').length).toBeGreaterThanOrEqual(8);
    expect(builtin.filter((x: any) => x.kind === 'image').length).toBeGreaterThanOrEqual(2);
    for (const b of builtin) { expect(b.source.url).toMatch(/^https:/); expect((await request(other).get(b.url)).status).toBe(200); }
    expect((await request(app).put(`/api/assets/${builtin[0].id}`).send({ name: '修改内置', tags: [] })).status).toBe(403);
    expect((await request(app).post(`/api/assets/${builtin[0].id}/archive`)).status).toBe(403);
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#abcdef' } }).png().toBuffer();
    expect((await request(app).post('/api/assets').attach('file', png, 'photo.png')).status).toBe(201);
  } finally { await rm(otherDir, { recursive: true, force: true }); }
});

test('UTF-8 multipart filenames become readable default names, while explicit Unicode names are preserved', async () => {
  const app = await appFor(await user());
  const filename = 'SVG验收-销售图表.svg';
  const implicit = await request(app).post('/api/assets').attach('file', Buffer.from(safeSVG), filename);
  expect(implicit.status).toBe(201);
  expect(implicit.body.name).toBe(filename);
  const explicit = await request(app).post('/api/assets').field('name', '月度分析 · café').attach('file', Buffer.from(safeSVG), filename);
  expect(explicit.status).toBe(201);
  expect(explicit.body.name).toBe('月度分析 · café');
  const boundary = 'asset-filename-regression';
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fallback.svg"; filename*=UTF-8''${encodeURIComponent(filename)}\r\nContent-Type: image/svg+xml\r\n\r\n`;
  const extended = await request(app).post('/api/assets').set('Content-Type', `multipart/form-data; boundary=${boundary}`).send(Buffer.from(prefix + safeSVG + `\r\n--${boundary}--\r\n`));
  expect(extended.status).toBe(201);
  expect(extended.body.name).toBe(filename);
  const latinHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="café.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`, 'latin1');
  const latin = await request(app).post('/api/assets').set('Content-Type', `multipart/form-data; boundary=${boundary}`).send(Buffer.concat([latinHeader, Buffer.from(safeSVG + `\r\n--${boundary}--\r\n`)]));
  expect(latin.status).toBe(201);
  expect(latin.body.name).toBe('café.svg');
});

test('processing preview is read-only; copies keep provenance, original bytes, private isolation and PPT compatibility', async () => {
  const actor = await user();
  const app = await createApp({ pool, actorId: actor, storageDir, workerEnabled: false });
  const other = await appFor(await user());
  const input = await sharp(Buffer.from([255,255,255,255, 255,0,0,255]), {raw:{width:2,height:1,channels:4}}).png().toBuffer();
  const upload = await request(app).post('/api/assets').field('tags','["演示"]').attach('file', input, '背景.png');
  expect(upload.status).toBe(201);
  const original = (await request(app).get(upload.body.url)).body;
  const opts = {operation:'removeBackground',targetColor:'#FFFFFF',tolerance:0};
  const count = async () => Number((await pool.query('SELECT count(*) FROM app.assets WHERE owner_id=$1',[actor])).rows[0].count);
  const before = await count();
  const preview = await request(app).post(`/api/assets/${upload.body.id}/processing-preview`).send(opts);
  expect(preview.status).toBe(200); expect(preview.headers['content-type']).toContain('image/png');
  expect(await count()).toBe(before);
  const rgba = await sharp(preview.body).ensureAlpha().raw().toBuffer();
  expect([...rgba]).toEqual([255,255,255,0, 255,0,0,255]);
  const copy = await request(app).post(`/api/assets/${upload.body.id}/processed-copies`).send({...opts,name:'透明副本'});
  expect(copy.status).toBe(201);
  expect(copy.body).toMatchObject({name:'透明副本',builtin:false,mime:'image/png',tags:['演示'],source:{derivedFrom:upload.body.id,processing:opts}});
  expect(copy.body.id).not.toBe(upload.body.id); expect(await count()).toBe(before+1);
  expect((await request(app).get(upload.body.url)).body).toEqual(original);
  for(const suffix of ['processing-preview','processed-copies']) expect((await request(other).post(`/api/assets/${upload.body.id}/${suffix}`).send(opts)).status).toBe(404);
  expect((await request(other).get(copy.body.url)).status).toBe(404);
  expect((await request(app).post(`/api/assets/${upload.body.id}/processing-preview`).send({...opts,tolerance:151})).status).toBe(422);
  expect((await request(app).post(`/api/assets/${upload.body.id}/processed-copies`).send({...opts,url:'https://example.com/image.png'})).status).toBe(422);
  const builtin = (await request(app).get('/api/assets')).body.items.find((a:any)=>a.builtin&&a.kind==='icon');
  const derived = await request(app).post(`/api/assets/${builtin.id}/processed-copies`).send({operation:'replaceBackground',targetColor:'#FFFFFF',backgroundColor:'#00AAFF',tolerance:0});
  expect(derived.status).toBe(201); expect(derived.body.builtin).toBe(false);
  const dataset = await request(app).post('/api/datasets').send({name:'处理副本',dataSpec:await fixture()});
  const page = await request(app).post('/api/slides').set('Idempotency-Key',randomUUID()).send({datasetId:dataset.body.id,templateId:'budget-comparison'});
  page.body.elements.push({id:'processed-image',type:'image',assetId:copy.body.id,rect:{x:820,y:390,w:96,h:48},z:10,fit:'contain'});
  const saved = await request(app).put(`/api/slides/${page.body.id}`).set('If-Match','1').send(page.body); expect(saved.status).toBe(200);
  const job = await request(app).post('/api/export-jobs').set('Idempotency-Key',randomUUID()).send({slideId:page.body.id,revision:saved.body.revision,deliveryMode:'draft'}); expect(job.status).toBe(202);
  const frozen = (await pool.query('SELECT export_spec FROM app.export_jobs WHERE id=$1',[job.body.id])).rows[0].export_spec;
  const output = path.join(storageDir,'processed-report.pptx');
  await writePptx(frozen.slides[0],output,async aid=>path.join(storageDir,frozen.assets.find((a:any)=>a.id===aid).storage_key));
  const zip = await JSZip.loadAsync(await readFile(output));
  const image = zip.file(/^ppt\/media\/.*\.png$/)[0];expect(image).toBeDefined();
  expect(await sharp(await image.async('nodebuffer')).ensureAlpha().raw().toBuffer()).toEqual(rgba);
});

test('SVG upload survives slide save/reopen and archive, with the same PNG embedded in a real PPTX', async () => {
  const app = await createApp({ pool, actorId: await user(), storageDir, workerEnabled: false });
  const uploaded = await request(app).post('/api/assets').attach('file', Buffer.from(safeSVG), 'report.svg');
  expect(uploaded.status).toBe(201);
  const dataset = await request(app).post('/api/datasets').send({ name: '素材验证', dataSpec: await fixture() });
  expect(dataset.status).toBe(201);
  const created = await request(app).post('/api/slides').set('Idempotency-Key', randomUUID()).send({ datasetId: dataset.body.id, templateId: 'budget-comparison' });
  expect(created.status).toBe(201);
  const slide = created.body;
  slide.elements.push({ id: 'report-image', type: 'image', assetId: uploaded.body.id, rect: { x: 820, y: 390, w: 96, h: 72 }, z: 10, fit: 'contain' });
  const saved = await request(app).put(`/api/slides/${slide.id}`).set('If-Match', '1').send(slide);
  expect(saved.status).toBe(200);
  expect((await request(app).get(`/api/slides/${slide.id}`)).body.elements.find((e: any) => e.id === 'report-image').assetId).toBe(uploaded.body.id);
  expect((await request(app).post(`/api/assets/${uploaded.body.id}/archive`)).status).toBe(200);
  const job = await request(app).post('/api/export-jobs').set('Idempotency-Key', randomUUID()).send({ slideId: slide.id, revision: saved.body.revision, deliveryMode: 'draft' });
  expect(job.status).toBe(202);
  const frozen = (await pool.query('SELECT export_spec FROM app.export_jobs WHERE id=$1', [job.body.id])).rows[0].export_spec;
  const output = path.join(storageDir, 'svg-report.pptx');
  await writePptx(frozen.slides[0], output, async aid => path.join(storageDir, frozen.assets.find((a: any) => a.id === aid).storage_key));
  const zip = await JSZip.loadAsync(await readFile(output));
  const pictures = zip.file(/^ppt\/media\/.*\.png$/);
  expect(pictures).toHaveLength(1);
  expect(await pictures[0].async('nodebuffer')).toEqual((await request(app).get(uploaded.body.url)).body);
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('<p:pic>');
});
test('vector assets require SVG and recolored copies preserve source without claiming vector format',async()=>{
 const app=await appFor(await user());
 const uploaded=await request(app).post('/api/assets').field('name','矢量测试').field('kind','vector').attach('file',Buffer.from(safeSVG),'shape.svg');expect(uploaded.status).toBe(201);expect(uploaded.body.kind).toBe('vector');
 const rejected=await request(app).post('/api/assets').field('name','不是矢量').field('kind','vector').attach('file',await sharp({create:{width:1,height:1,channels:4,background:'#000'}}).png().toBuffer(),'pixel.png');expect(rejected.status).toBe(422);
 const preview=await request(app).post(`/api/assets/${uploaded.body.id}/processing-preview`).send({operation:'recolor',color:'#e10000'});expect(preview.status).toBe(200);expect(preview.headers['content-type']).toContain('image/png');
 const copy=await request(app).post(`/api/assets/${uploaded.body.id}/processed-copies`).send({operation:'recolor',color:'#e10000',name:'红色副本'});expect(copy.status).toBe(201);expect(copy.body.kind).toBe('image');expect(copy.body.source.derivedFrom).toBe(uploaded.body.id);expect(copy.body.originalMime).toBe('image/png');
 const original=await request(app).get(uploaded.body.originalUrl);expect(original.status).toBe(200);expect(original.body.toString()).toBe(safeSVG);
});
