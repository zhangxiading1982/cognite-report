import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {BUSINESS_TEMPLATES,PHASE2_TEMPLATES} from '@slidebi/presentation';
import {validateBuiltinAssetManifest} from '../src/asset-manifest.ts';
import {
  ASSET_FOLDERS,
  TEMPLATE_FOLDERS,
  templateFolderId,
  validateFolderPlan,
} from '../src/catalog-structure.ts';

describe('catalog directory plan',()=>{
  it('assigns every bundled template to a maintained directory instead of root',()=>{
    const ids=['budget-comparison','monthly-trend','revenue-bridge',...PHASE2_TEMPLATES.map(item=>item.id),...BUSINESS_TEMPLATES.map(item=>item.id)];
    expect(validateFolderPlan(TEMPLATE_FOLDERS)).toEqual([]);
    expect(ids.every(id=>Boolean(templateFolderId(id)))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the resource directory hierarchy valid',()=>{
    expect(validateFolderPlan(ASSET_FOLDERS)).toEqual([]);
    expect(ASSET_FOLDERS.map(folder=>folder.name)).toEqual(expect.arrayContaining([
      '图标','矢量图','图片','人物角色','数据技术','办公商务','物流供应链','科技制造','可持续发展',
    ]));
    expect(ASSET_FOLDERS).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'asset-folder-icons-people',parentId:'asset-folder-icons'}),
      expect.objectContaining({id:'asset-folder-icons-data-tech',parentId:'asset-folder-icons'}),
      expect.objectContaining({id:'asset-folder-vectors-people',parentId:'asset-folder-vectors'}),
      expect.objectContaining({id:'asset-folder-vectors-data-tech',parentId:'asset-folder-vectors'}),
    ]));
  });

  it('keeps bundled resources unique, licensed and assigned to a directory',async()=>{
    const manifest=JSON.parse(await readFile(new URL('../fixtures/assets/manifest.json',import.meta.url),'utf8'));
    expect(validateBuiltinAssetManifest(manifest,ASSET_FOLDERS)).toEqual([]);
    const counts=manifest.items.reduce((result:Record<string,number>,item:{kind:string})=>{
      result[item.kind]=(result[item.kind]||0)+1;
      return result;
    },{});
    expect(counts).toMatchObject({icon:62,vector:38,image:12});
    expect(manifest.items).toEqual(expect.arrayContaining([
      expect.objectContaining({name:'数据分析师',kind:'icon',folderId:'asset-folder-icons-people'}),
      expect.objectContaining({name:'开发工程师头像',kind:'vector',folderId:'asset-folder-vectors-people'}),
      expect.objectContaining({name:'Apache Spark（单色）',kind:'icon',folderId:'asset-folder-icons-data-tech'}),
      expect.objectContaining({name:'PostgreSQL（彩色）',kind:'vector',folderId:'asset-folder-vectors-data-tech'}),
    ]));
  });
});
