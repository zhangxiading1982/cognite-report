import type { Express } from 'express';
import { validateDataSpec, type DataSpec } from '@slidebi/presentation';
import fixtureData from '../fixtures/monthly-operations.data.json';
import { HttpError } from './db';
import { completeDataSpecSchema } from './data-schema.ts';

// This is a local simulator, not a connection to BI Studio. Only simulated source
// state resets on process restart; persisted user datasets are managed separately.
const charts = new Map([
  ['chart-demo-budget', { name: '收入预算对比（模拟）', revision: 1, failed: false, data: initialData('chart-demo-budget') }],
  ['chart-demo-trend', { name: '月度收入趋势（模拟）', revision: 1, failed: false, data: initialData('chart-demo-trend') }],
  ['chart-demo-bridge', { name: '收入变动归因（模拟）', revision: 1, failed: false, data: initialData('chart-demo-bridge') }],
]);

function initialData(chartId: string): DataSpec {
  const data = completeDataSpecSchema(fixtureData);
  data.source.system = 'BI Studio Mock';
  data.snapshot.id = `mock-${chartId}-v1`;
  const validated = validateDataSpec(data);
  if (!validated.valid) throw new Error('Invalid BI Studio mock fixture');
  return validated.data!;
}

function chart(chartId: string) {
  const value = charts.get(chartId);
  if (!value) throw new HttpError(404, 'MOCK_BI_CHART_NOT_FOUND', '模拟图表不存在');
  return value;
}

// Exact base-10 arithmetic keeps every related result set balanced, even after
// repeated advances; metadata, integer sort keys and dates are never scaled.
function increaseDecimal(value: string): string {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const digits = (BigInt(whole + fraction) * 11n).toString().padStart(fraction.length + 2, '0');
  const point = digits.length - fraction.length - 1;
  const result = `${digits.slice(0, point)}.${digits.slice(point)}`.replace(/0+$/, '').replace(/\.$/, '');
  return negative && result !== '0' ? `-${result}` : result;
}

/** Adapter seam for the future BI API. Consumers calculate their own source hash. */
export async function mockFetchDataSpec(chartId: string): Promise<DataSpec> {
  const selected = chart(chartId);
  if (selected.failed) throw new HttpError(503, 'MOCK_BI_UNAVAILABLE', 'BI Studio 模拟源暂时不可用');
  return structuredClone(selected.data);
}

export function registerMockBiRoutes(app: Express): void {
  app.get('/api/mock-bi/charts', (_req, res) => {
    res.json({
      items: [...charts].map(([chartId, { name, revision }]) => ({ chartId, name, revision })),
      mode: 'mock',
      notice: 'BI Studio 模拟源，尚未连接真实 BI API；服务重启会重置模拟源状态，已保存的用户数据不受影响。',
    });
  });
  app.post('/api/mock-bi/charts/:chartId/data-spec-exports', async (req, res) => {
    res.json(await mockFetchDataSpec(req.params.chartId));
  });
  app.post('/api/mock-bi/charts/:chartId/advance', (req, res) => {
    const selected = chart(req.params.chartId);
    const scenario = req.body?.scenario;
    if (!['increase', 'unchanged', 'fail', 'recover'].includes(scenario)) {
      throw new HttpError(422, 'INVALID_MOCK_SCENARIO', '请选择 increase、unchanged、fail 或 recover');
    }
    if (scenario === 'increase') {
      const data = structuredClone(selected.data);
      for (const resultSet of data.resultSets) {
        for (const field of resultSet.fields.filter(field => field.type === 'decimal')) {
          for (const row of resultSet.rows) {
            if (typeof row[field.id] === 'string') row[field.id] = increaseDecimal(row[field.id] as string);
          }
        }
      }
      const revision = selected.revision + 1;
      data.source.modelRevision = String(revision);
      data.snapshot.id = `mock-${req.params.chartId}-v${revision}`;
      const validated = validateDataSpec(data);
      if (!validated.valid) throw new Error('Invalid advanced BI Studio mock DataSpec');
      selected.data = validated.data!;
      selected.revision = revision;
    }
    if (scenario === 'fail') selected.failed = true;
    if (scenario === 'recover') selected.failed = false;
    res.json({ chartId: req.params.chartId, revision: selected.revision, scenario, available: !selected.failed });
  });
}
