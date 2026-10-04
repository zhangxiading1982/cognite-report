import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';

const drawingML = 'http://schemas.openxmlformats.org/drawingml/2006/main';
interface XmlNode {
  name: string;
  local: string;
  uri: string;
  prefix: string;
  attributes: Record<string, string>;
  children: Array<XmlNode | string>;
}
const escape = (value: string) => value.replace(/[&<>"\r]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\r': '&#13;' })[c]!);
const elements = (node: XmlNode) => node.children.filter((child): child is XmlNode => typeof child !== 'string');
const is = (node: XmlNode, local: string) => node.uri === drawingML && node.local === local;
function font(node: XmlNode, local: string, attributes: Record<string, string>): XmlNode {
  return { name: node.prefix ? `${node.prefix}:${local}` : local, local, uri: drawingML, prefix: node.prefix, attributes, children: [] };
}
function ensureEastAsian(node: XmlNode, fontFace: string) {
  const existing = elements(node).find(child => is(child, 'ea'));
  if (existing) {
    if (!existing.attributes.typeface) existing.attributes.typeface = fontFace;
    return;
  }
  // DrawingML orders font children latin, ea, cs, sym, then hyperlinks.
  const afterLatin = node.children.findIndex(child => typeof child !== 'string' && is(child, 'latin'));
  const beforeCs = node.children.findIndex(child => typeof child !== 'string' && ['cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'].some(local => is(child, local)));
  const index = afterLatin >= 0 ? afterLatin + 1 : beforeCs >= 0 ? beforeCs : node.children.length;
  node.children.splice(index, 0, font(node, 'ea', { typeface: fontFace }));
}

/** Fill missing East Asian chart fonts and PptxGenJS's stock Hans theme mapping.
 * Existing explicit run/EA/custom Hans fonts and all Latin font choices survive. */
export function normalizeFontXml(xml: string, fontFace: string, kind: 'theme' | 'chart'): string {
  const roots: XmlNode[] = [], stack: XmlNode[] = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', error => { throw error; });
  parser.on('doctype', () => { throw new Error('Unexpected DTD in generated presentation'); });
  parser.on('processinginstruction', () => { throw new Error('Unexpected processing instruction in generated presentation'); });
  parser.on('opentag', tag => {
    const node: XmlNode = { name: tag.name, local: tag.local, uri: tag.uri, prefix: tag.prefix, attributes: Object.fromEntries(Object.values(tag.attributes).map(a => [a.name, a.value])), children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node); else roots.push(node);
    stack.push(node);
  });
  const text = (value: string) => { if (stack.length) stack[stack.length - 1].children.push(value); };
  parser.on('text', text); parser.on('cdata', text);
  parser.on('closetag', () => { stack.pop(); });
  parser.write(xml).close();
  if (roots.length !== 1) throw new Error('Invalid generated presentation XML');
  function visit(node: XmlNode) {
    if (kind === 'chart' && ['rPr', 'defRPr', 'endParaRPr'].some(local => is(node, local))) ensureEastAsian(node, fontFace);
    if (kind === 'theme' && ['majorFont', 'minorFont'].some(local => is(node, local))) {
      ensureEastAsian(node, fontFace);
      const hans = elements(node).find(child => is(child, 'font') && child.attributes.script === 'Hans');
      if (!hans) node.children.push(font(node, 'font', { script: 'Hans', typeface: fontFace }));
      else if (!hans.attributes.typeface || ['等线', '等线 Light', 'DengXian', 'DengXian Light'].includes(hans.attributes.typeface)) hans.attributes.typeface = fontFace;
    }
    elements(node).forEach(visit);
  }
  visit(roots[0]);
  function serialize(node: XmlNode): string {
    const start = `<${node.name}${Object.entries(node.attributes).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')}`;
    return node.children.length ? `${start}>${node.children.map(child => typeof child === 'string' ? escape(child) : serialize(child)).join('')}</${node.name}>` : `${start}/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${serialize(roots[0])}`;
}

export async function normalizePptxFonts(file: string, fontFace: string, chartFonts: string[] = []): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(file));
  for (const part of zip.file(/^ppt\/(?:theme\/theme\d+|charts\/chart\d+)\.xml$/)) {
    const kind = part.name.startsWith('ppt/theme/') ? 'theme' : 'chart';
    const chartIndex = kind === 'chart' ? Number(/chart(\d+)\.xml$/.exec(part.name)![1]) - 1 : -1;
    zip.file(part.name, normalizeFontXml(await part.async('string'), chartFonts[chartIndex] ?? fontFace, kind));
  }
  await writeFile(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
