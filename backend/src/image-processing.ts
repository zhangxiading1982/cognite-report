import sharp from 'sharp';
import { fail, HttpError } from './db.ts';

const maxPixels = 4_000_000;
type Operation = 'removeBackground' | 'replaceBackground' | 'recolor';
export interface ProcessingOptions {
  operation: Operation;
  color?: string;
  targetColor: string;
  backgroundColor?: string;
  tolerance: number;
  algorithm: 'edge-connected-rgb-v1' | 'alpha-preserving-tint-v1';
}
function parseOptions(input: unknown): ProcessingOptions {
  const invalid = () => fail(422, 'INVALID_IMAGE_PROCESSING', '请选择去底或换底、#RRGGBB颜色和0–150数值容差');
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  if (value.operation === 'recolor') {
    if (Object.keys(value).some(key => !['operation','color'].includes(key)) || typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color)) return invalid();
    return {operation:'recolor',color:value.color.toUpperCase(),targetColor:'#FFFFFF',tolerance:0,algorithm:'alpha-preserving-tint-v1'};
  }
  if (Object.keys(value).some(key => !['operation', 'targetColor', 'backgroundColor', 'tolerance'].includes(key))) return invalid();
  if (typeof value.operation !== 'string' || !['removeBackground', 'replaceBackground'].includes(value.operation)) return invalid();
  const targetColor = value.targetColor === undefined ? '#FFFFFF' : value.targetColor;
  const tolerance = value.tolerance === undefined ? 30 : value.tolerance;
  const isColor = (color: unknown): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
  if (!isColor(targetColor) || typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 150) return invalid();
  if ((value.operation === 'replaceBackground' || value.backgroundColor !== undefined) && !isColor(value.backgroundColor)) return invalid();
  return { operation: value.operation as Operation, targetColor: targetColor.toUpperCase(), tolerance, ...(value.operation === 'replaceBackground' ? { backgroundColor: (value.backgroundColor as string).toUpperCase() } : {}), algorithm: 'edge-connected-rgb-v1' };
}
const rgb = (color: string) => [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));

/** Pure solid-background processing. Four-connected flood fill from all edges;
 * fully transparent pixels are traversable, enclosed same-color islands stay. */
export async function processAssetImage(input: Buffer, options: unknown): Promise<{ png: Buffer; processing: ProcessingOptions }> {
  const processing = parseOptions(options);
  try {
    const image = sharp(input, { limitInputPixels: maxPixels });
    const metadata = await image.metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) fail(422, 'IMAGE_PROCESSING_LIMIT', '纯色底色处理仅支持400万像素以内的标准PNG，请先缩小图片');
    const { data, info } = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const width = info.width, height = info.height, count = width * height;
    if (processing.operation === 'recolor') {
      const color = rgb(processing.color!);
      for (let offset=0;offset<data.length;offset+=4) for(let channel=0;channel<3;channel++) data[offset+channel]=color[channel];
      return {png:await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),processing};
    }
    const visited = new Uint8Array(count), queue = new Uint32Array(count);
    const target = rgb(processing.targetColor), threshold = processing.tolerance ** 2;
    let head = 0, tail = 0;
    const visit = (index: number) => {
      if (visited[index]) return;
      visited[index] = 1;
      const offset = index * 4;
      const distance = (data[offset] - target[0]) ** 2 + (data[offset + 1] - target[1]) ** 2 + (data[offset + 2] - target[2]) ** 2;
      if (data[offset + 3] === 0 || distance <= threshold) {
        data[offset + 3] = 0;
        queue[tail++] = index;
      }
    };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    while (head < tail) {
      const index = queue[head++], x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < count - width) visit(index + width);
    }
    if (processing.operation === 'replaceBackground') {
      const background = rgb(processing.backgroundColor!);
      for (let offset = 0; offset < data.length; offset += 4) {
        const alpha = data[offset + 3];
        for (let channel = 0; channel < 3; channel++) data[offset + channel] = Math.round((data[offset + channel] * alpha + background[channel] * (255 - alpha)) / 255);
        data[offset + 3] = 255;
      }
    }
    return { png: await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(), processing };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(422, 'IMAGE_PROCESSING_LIMIT', '图片无法处理；请使用400万像素以内的标准PNG');
  }
}
