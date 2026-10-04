import { beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { D, validateDataSpec } from '@slidebi/presentation';
import { fixture } from '../src/db';

async function setup() {
  const mock = await import('../src/mock-bi');
  const app = express();
  app.use(express.json());
  mock.registerMockBiRoutes(app);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ code: error.code }));
  return { app, ...mock };
}
beforeEach(() => vi.resetModules());

test('lists three explicitly simulated charts and exports intact valid DataSpec 1.0', async () => {
  const { app, mockFetchDataSpec } = await setup();
  const listed = await request(app).get('/api/mock-bi/charts');
  expect(listed.status).toBe(200);
  expect(listed.body.items.map((item: any) => item.chartId)).toEqual(['chart-demo-budget', 'chart-demo-trend', 'chart-demo-bridge']);
  for (const item of listed.body.items) {
    expect(item.revision).toBe(1);
    const exported = await request(app).post(`/api/mock-bi/charts/${item.chartId}/data-spec-exports`).send({});
    expect(exported.status).toBe(200);
    expect(validateDataSpec(exported.body).valid).toBe(true);
    expect(exported.body.source.system).toBe('BI Studio Mock');
    const base = await fixture();
    for (const key of ['context', 'semanticSchema', 'measures', 'queries', 'resultSets', 'chartHints']) expect(exported.body[key]).toEqual(base[key]);
    expect(await mockFetchDataSpec(item.chartId)).toEqual(exported.body);
  }
});

test('increase preserves decimal strings, bridge balance, cross-result totals and metadata; unchanged is byte-stable', async () => {
  const { app, mockFetchDataSpec } = await setup();
  const chart = 'chart-demo-budget';
  const initial = await mockFetchDataSpec(chart);
  expect((await request(app).post(`/api/mock-bi/charts/${chart}/advance`).send({ scenario: 'increase' })).status).toBe(200);
  const response = await request(app).post(`/api/mock-bi/charts/${chart}/data-spec-exports`).send({});
  expect(validateDataSpec(response.body).valid).toBe(true);
  expect(response.body.source.modelRevision).toBe('2');
  expect(response.body.snapshot.id).not.toBe(initial.snapshot.id);
  const [budget, trend, bridge] = response.body.resultSets;
  expect(budget.rows[0].actual).toBe('13200000');
  expect(budget.fields).toEqual(initial.resultSets[0].fields);
  expect(bridge.rows.map((row: any) => row.order)).toEqual([0, 1, 2, 3, 4]);
  const total = budget.rows.reduce((sum: InstanceType<typeof D>, row: any) => sum.add(row.actual), new D(0));
  expect(total.eq(trend.rows.at(-1).revenue)).toBe(true);
  expect(total.eq(bridge.rows.at(-1).amount)).toBe(true);
  expect(bridge.rows.slice(0, -1).reduce((sum: InstanceType<typeof D>, row: any) => sum.add(row.amount), new D(0)).eq(total)).toBe(true);
  await request(app).post(`/api/mock-bi/charts/${chart}/advance`).send({ scenario: 'unchanged' });
  expect(await mockFetchDataSpec(chart)).toEqual(response.body);
  expect((await mockFetchDataSpec('chart-demo-trend')).source.modelRevision).toBe('1');
  response.body.resultSets[0].rows[0].actual = '0';
  expect((await mockFetchDataSpec(chart)).resultSets[0].rows[0].actual).toBe('13200000');
});

test('failure is recoverable without modifying data; unknown chart and invalid scenario are rejected', async () => {
  const { app, mockFetchDataSpec } = await setup();
  const chart = 'chart-demo-bridge';
  const original = await mockFetchDataSpec(chart);
  await request(app).post(`/api/mock-bi/charts/${chart}/advance`).send({ scenario: 'fail' });
  expect((await request(app).post(`/api/mock-bi/charts/${chart}/data-spec-exports`)).status).toBe(503);
  await expect(mockFetchDataSpec(chart)).rejects.toMatchObject({ status: 503 });
  await request(app).post(`/api/mock-bi/charts/${chart}/advance`).send({ scenario: 'recover' });
  expect(await mockFetchDataSpec(chart)).toEqual(original);
  expect((await request(app).post(`/api/mock-bi/charts/${chart}/advance`).send({ scenario: 'delete' })).status).toBe(422);
  for (const suffix of ['advance', 'data-spec-exports']) expect((await request(app).post(`/api/mock-bi/charts/unknown/${suffix}`).send({ scenario: 'increase' })).status).toBe(404);
  await expect(mockFetchDataSpec('https://example.com')).rejects.toMatchObject({ status: 404 });
});
