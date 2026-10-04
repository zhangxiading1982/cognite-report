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
    expect(ASSET_FOLDERS.map(folder=>folder.name)).toEqual(expect.arrayContaining(['图标','矢量图','图片']));
  });

  it('keeps bundled resources unique, licensed and assigned to a directory',async()=>{
    const manifest=JSON.parse(await readFile(new URL('../fixtures/assets/manifest.json',import.meta.url),'utf8'));
    expect(validateBuiltinAssetManifest(manifest,ASSET_FOLDERS)).toEqual([]);
  });
});
