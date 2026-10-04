import type {CatalogFolder} from './catalog-structure.ts';

export type BuiltinAssetManifest = {
  items: Array<{
    id:string;
    file:string;
    name:string;
    kind:'image'|'icon'|'vector';
    folderId:string;
    tags:string[];
    source:{license?:string;licenseFile?:string;url?:string;sha256?:string};
  }>;
};

export function validateBuiltinAssetManifest(manifest:BuiltinAssetManifest,folders:CatalogFolder[]):string[]{
  const errors:string[]=[];
  const assetFolders=new Set(folders.filter(folder=>folder.kind==='assets').map(folder=>folder.id));
  for(const field of ['id','file'] as const){
    const seen=new Set<string>();
    for(const item of manifest.items){
      if(seen.has(item[field]))errors.push(`资源 ${field} 重复：${item[field]}`);
      seen.add(item[field]);
    }
  }
  const hashes=new Set<string>();
  for(const item of manifest.items){
    if(!assetFolders.has(item.folderId))errors.push(`资源 ${item.id} 的目录不存在：${item.folderId}`);
    if(!item.source.license||!item.source.licenseFile||!item.source.url)errors.push(`资源 ${item.id} 缺少来源或许可证`);
    if(!item.source.sha256)errors.push(`资源 ${item.id} 缺少 SHA-256`);
    else if(hashes.has(item.source.sha256))errors.push(`资源文件重复：${item.id}`);
    else hashes.add(item.source.sha256);
  }
  return errors;
}
