-- Give bundled and existing catalog content a stable, browsable directory plan.
INSERT INTO app.folders(id,kind,owner_id,name,parent_id)
SELECT id,kind,(SELECT id FROM app.users WHERE username='marx'),name,NULL
FROM (VALUES
 ('template-folder-general','templates','通用叙事'),
 ('template-folder-finance','templates','经营与财务'),
 ('template-folder-project','templates','项目管理'),
 ('template-folder-strategy','templates','战略与销售'),
 ('template-folder-organization','templates','组织与协作'),
 ('template-folder-analysis','templates','专业分析'),
 ('template-folder-charts','templates','图表分析'),
 ('template-folder-uncategorized','templates','未分类'),
 ('asset-folder-icons','assets','图标'),
 ('asset-folder-vectors','assets','矢量图'),
 ('asset-folder-images','assets','图片')
) AS planned(id,kind,name)
ON CONFLICT(id) DO NOTHING;

INSERT INTO app.folders(id,kind,owner_id,name,parent_id)
SELECT id,'assets',(SELECT id FROM app.users WHERE username='marx'),name,parent_id
FROM (VALUES
 ('asset-folder-icons-business','经营分析','asset-folder-icons'),
 ('asset-folder-icons-collaboration','协作与状态','asset-folder-icons'),
 ('asset-folder-icons-commerce','商品零售','asset-folder-icons'),
 ('asset-folder-vectors-business','商业表达','asset-folder-vectors'),
 ('asset-folder-vectors-commerce','商品零售','asset-folder-vectors'),
 ('asset-folder-images-covers','封面背景','asset-folder-images'),
 ('asset-folder-images-products','商品摄影','asset-folder-images')
) AS planned(id,name,parent_id)
ON CONFLICT(id) DO NOTHING;

UPDATE app.templates
SET folder_id='template-folder-charts'
WHERE archived_at IS NULL AND folder_id IS NULL AND id IN (
 'budget-comparison','monthly-trend','revenue-bridge','channel-stacked','channel-percent',
 'region-pie','region-donut','revenue-margin-combo','revenue-area','budget-actual-scatter'
);
UPDATE app.templates
SET folder_id='template-folder-uncategorized'
WHERE archived_at IS NULL AND folder_id IS NULL;

-- Remove only byte-identical, same-name image copies. A referenced copy is always retained.
WITH candidates AS (
 SELECT a.id,a.owner_id,a.kind,lower(a.name) AS normalized_name,o.sha256,a.created_at,
   EXISTS(SELECT 1 FROM app.slide_asset_refs r WHERE r.asset_id=a.id)
   OR EXISTS(SELECT 1 FROM app.template_asset_refs r WHERE r.asset_id=a.id) AS referenced
 FROM app.assets a
 JOIN app.storage_objects o ON o.id=a.original_object_id
 WHERE a.archived_at IS NULL AND a.kind='image' AND a.id NOT LIKE 'builtin-%'
), ranked AS (
 SELECT id,referenced,row_number() OVER(
   PARTITION BY owner_id,kind,normalized_name,sha256
   ORDER BY referenced DESC,created_at,id
 ) AS duplicate_order
 FROM candidates
)
UPDATE app.assets a SET archived_at=now()
FROM ranked r
WHERE a.id=r.id AND r.duplicate_order>1 AND NOT r.referenced;

UPDATE app.assets SET folder_id='asset-folder-icons-business'
WHERE folder_id IS NULL AND id IN (
 'builtin-lucide-trending-up','builtin-lucide-chart-column','builtin-lucide-target',
 'builtin-lucide-briefcase','builtin-lucide-building-2','builtin-lucide-globe','builtin-lucide-leaf',
 'builtin-lucide-dollar-sign','builtin-lucide-lightbulb',
 'builtin-lucide-map-pin','builtin-lucide-rocket'
);
UPDATE app.assets SET folder_id='asset-folder-icons-collaboration'
WHERE folder_id IS NULL AND id IN (
 'builtin-lucide-users','builtin-lucide-clock','builtin-lucide-check','builtin-lucide-calendar-days',
 'builtin-lucide-triangle-alert','builtin-lucide-handshake','builtin-lucide-flag'
);
UPDATE app.assets SET folder_id='asset-folder-icons-commerce'
WHERE folder_id IS NULL AND id IN ('builtin-lucide-shirt','builtin-lucide-shopping-bag');
UPDATE app.assets SET folder_id='asset-folder-vectors-business'
WHERE folder_id IS NULL AND id IN (
 'builtin-twemoji-chart-increasing','builtin-twemoji-direct-hit','builtin-twemoji-light-bulb',
 'builtin-twemoji-calendar','builtin-twemoji-handshake'
);
UPDATE app.assets SET folder_id='asset-folder-vectors-commerce'
WHERE folder_id IS NULL AND id IN ('builtin-twemoji-tshirt','builtin-twemoji-package');
UPDATE app.assets SET folder_id='asset-folder-images-covers'
WHERE folder_id IS NULL AND id IN ('builtin-city-skyline','builtin-blue-marble');
UPDATE app.assets SET folder_id='asset-folder-images-products'
WHERE folder_id IS NULL AND id IN ('builtin-pexels-camera','builtin-pexels-clothing');

-- Existing user uploads remain intact and move under their broad type directory.
UPDATE app.assets SET folder_id=CASE kind
 WHEN 'icon' THEN 'asset-folder-icons'
 WHEN 'vector' THEN 'asset-folder-vectors'
 ELSE 'asset-folder-images'
END
WHERE archived_at IS NULL AND folder_id IS NULL;
