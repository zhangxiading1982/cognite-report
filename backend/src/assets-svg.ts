import { SaxesParser } from 'saxes';
import { fail } from './db.ts';

const svgNamespace = 'http://www.w3.org/2000/svg';
const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc']);
const attributes = new Set(['id', 'width', 'height', 'viewBox', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'transform', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'preserveAspectRatio', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'vector-effect']);

/** Strict XML parsing precedes librsvg; originals must be safe too. */
export function validateStaticSvg(bytes: Buffer): void {
  const reject = () => fail(422, 'UNSAFE_SVG', '仅支持静态 SVG 图形；不支持脚本、样式、外部资源或嵌入内容');
  if (bytes.length > 1024 * 1024) reject();
  let xml: string;
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return reject(); }
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0, nodes = 0;
  parser.on('error', reject);
  parser.on('doctype', reject);
  parser.on('processinginstruction', reject);
  parser.on('xmldecl', decl => { if (decl.version !== '1.0' || (decl.encoding && !/^utf-8$/i.test(decl.encoding))) reject(); });
  parser.on('opentag', tag => {
    depth++; nodes++;
    if (depth > 32 || nodes > 5000 || tag.uri !== svgNamespace || tag.prefix || !tags.has(tag.local) || (depth === 1 && tag.local !== 'svg') || (depth > 1 && tag.local === 'svg')) reject();
    if (Object.keys(tag.attributes).length > 40) reject();
    for (const attr of Object.values(tag.attributes)) {
      if (attr.name === 'xmlns' && attr.value === svgNamespace) continue;
      if (attr.uri || attr.prefix || !attributes.has(attr.name) || attr.value.length > 16384 || /url\s*\(|[\\:;<>]/i.test(attr.value)) reject();
    }
  });
  parser.on('closetag', () => { depth--; });
  parser.write(xml).close();
  if (!nodes || depth !== 0) reject();
}
