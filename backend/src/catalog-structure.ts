import {
  BUSINESS_TEMPLATE_FOLDERS,
  BUSINESS_TEMPLATES,
  PHASE2_TEMPLATES,
} from '@slidebi/presentation';

export type CatalogFolder = {
  id: string;
  kind: 'templates' | 'assets';
  name: string;
  parentId?: string;
};

export const TEMPLATE_FOLDERS: CatalogFolder[] = [
  ...BUSINESS_TEMPLATE_FOLDERS.map(folder=>({...folder,kind:'templates' as const})),
  {id:'template-folder-charts',kind:'templates',name:'图表分析'},
  {id:'template-folder-uncategorized',kind:'templates',name:'未分类'},
];

export const ASSET_FOLDERS: CatalogFolder[] = [
  {id:'asset-folder-icons',kind:'assets',name:'图标'},
  {id:'asset-folder-icons-business',kind:'assets',name:'经营分析',parentId:'asset-folder-icons'},
  {id:'asset-folder-icons-collaboration',kind:'assets',name:'协作与状态',parentId:'asset-folder-icons'},
  {id:'asset-folder-icons-commerce',kind:'assets',name:'商品零售',parentId:'asset-folder-icons'},
  {id:'asset-folder-icons-people',kind:'assets',name:'人物角色',parentId:'asset-folder-icons'},
  {id:'asset-folder-icons-data-tech',kind:'assets',name:'数据技术',parentId:'asset-folder-icons'},
  {id:'asset-folder-vectors',kind:'assets',name:'矢量图'},
  {id:'asset-folder-vectors-business',kind:'assets',name:'商业表达',parentId:'asset-folder-vectors'},
  {id:'asset-folder-vectors-commerce',kind:'assets',name:'商品零售',parentId:'asset-folder-vectors'},
  {id:'asset-folder-vectors-people',kind:'assets',name:'人物角色',parentId:'asset-folder-vectors'},
  {id:'asset-folder-vectors-data-tech',kind:'assets',name:'数据技术',parentId:'asset-folder-vectors'},
  {id:'asset-folder-images',kind:'assets',name:'图片'},
  {id:'asset-folder-images-covers',kind:'assets',name:'封面背景',parentId:'asset-folder-images'},
  {id:'asset-folder-images-products',kind:'assets',name:'商品摄影',parentId:'asset-folder-images'},
  {id:'asset-folder-images-office',kind:'assets',name:'办公商务',parentId:'asset-folder-images'},
  {id:'asset-folder-images-logistics',kind:'assets',name:'物流供应链',parentId:'asset-folder-images'},
  {id:'asset-folder-images-industry',kind:'assets',name:'科技制造',parentId:'asset-folder-images'},
  {id:'asset-folder-images-sustainability',kind:'assets',name:'可持续发展',parentId:'asset-folder-images'},
];

const templateFoldersById = new Map<string,string>([
  ...BUSINESS_TEMPLATES.map(template=>[template.id,template.folderId] as const),
  ...['budget-comparison','monthly-trend','revenue-bridge',...PHASE2_TEMPLATES.map(template=>template.id)]
    .map(id=>[id,'template-folder-charts'] as const),
]);

export const templateFolderId = (templateId:string) => templateFoldersById.get(templateId);

export function validateFolderPlan(folders:CatalogFolder[]):string[]{
  const errors:string[]=[];
  const ids=new Set<string>();
  for(const folder of folders){
    if(ids.has(folder.id))errors.push(`目录 ID 重复：${folder.id}`);
    ids.add(folder.id);
  }
  for(const folder of folders){
    if(folder.parentId&&!ids.has(folder.parentId))errors.push(`目录 ${folder.id} 的父目录不存在：${folder.parentId}`);
    const visited=new Set([folder.id]);
    let current=folder;
    while(current.parentId){
      if(visited.has(current.parentId)){errors.push(`目录形成循环：${folder.id}`);break;}
      visited.add(current.parentId);
      const parent=folders.find(item=>item.id===current.parentId);
      if(!parent)break;
      if(parent.kind!==folder.kind){errors.push(`目录类型不一致：${folder.id}`);break;}
      current=parent;
    }
  }
  return errors;
}
