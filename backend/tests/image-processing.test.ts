import { expect, test } from 'vitest';
import sharp from 'sharp';
import { processAssetImage } from '../src/image-processing.ts';

async function png(width: number, height: number, pixels: number[]) {
  return sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer();
}
async function pixels(image: Buffer) { return sharp(image).ensureAlpha().raw().toBuffer(); }
test('edge flood removes only connected target color and keeps an enclosed same-color island', async () => {
  const source: number[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) source.push(...((x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2)) ? [255,255,255,255] : [0,0,0,255]));
  const input = await png(5,5,source), original = Buffer.from(input);
  const output = await processAssetImage(input, { operation:'removeBackground', tolerance:0 });
  const actual = await pixels(output.png);
  expect(actual[3]).toBe(0);
  expect([...actual.subarray(12*4,13*4)]).toEqual([255,255,255,255]);
  expect([...actual.subarray(6*4,7*4)]).toEqual([0,0,0,255]);
  expect(input).toEqual(original);
  expect(output.processing).toMatchObject({ operation:'removeBackground', targetColor:'#FFFFFF', tolerance:0 });
});
test('uses Euclidean RGB distance and composites existing alpha onto replacement color', async () => {
  const input = await png(3,1,[253,254,255,255, 255,0,0,128, 50,60,70,0]);
  const low = await pixels((await processAssetImage(input,{operation:'removeBackground',tolerance:2})).png);
  expect(low[3]).toBe(255); expect(low[11]).toBe(0);
  const high = await pixels((await processAssetImage(input,{operation:'replaceBackground',tolerance:3,backgroundColor:'#0000ff'})).png);
  expect([...high.subarray(0,4)]).toEqual([0,0,255,255]);
  expect([...high.subarray(4,8)]).toEqual([128,0,127,255]);
  expect([...high.subarray(8,12)]).toEqual([0,0,255,255]);
});
test.each([
  {}, {operation:'aiCutout'}, {operation:'removeBackground',tolerance:-1},
  {operation:'removeBackground',tolerance:151}, {operation:'removeBackground',tolerance:'30'},
  {operation:'removeBackground',tolerance:NaN}, {operation:'removeBackground',targetColor:'white'},
  {operation:'removeBackground',tolerance:null}, {operation:'removeBackground',targetColor:null}, {operation:{toString:null}},
  {operation:'replaceBackground'}, {operation:'replaceBackground',backgroundColor:'#12ZZ00'},
  {operation:'removeBackground',url:'https://example.com/a.png'},
])('rejects invalid processing options %j', async options => {
  await expect(processAssetImage(await png(1,1,[255,255,255,255]),options)).rejects.toMatchObject({status:422});
});
test('rejects oversized images before allocating the flood queue', async () => {
  const large = await sharp({create:{width:2001,height:2000,channels:3,background:'#ffffff'}}).png().toBuffer();
  await expect(processAssetImage(large,{operation:'removeBackground',tolerance:150})).rejects.toMatchObject({status:422});
});
test('recolors shape pixels and preserves alpha without changing input',async()=>{
 const input=await png(2,1,[12,24,36,128,255,255,255,0]),before=Buffer.from(input);
 const result=await processAssetImage(input,{operation:'recolor',color:'#123abc'});
 expect([...await pixels(result.png)]).toEqual([18,58,188,128,18,58,188,0]);expect(input).toEqual(before);
 await expect(processAssetImage(input,{operation:'recolor',color:'red'})).rejects.toMatchObject({status:422});
});
