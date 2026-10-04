-- Separate role/avatar assets and data technology marks from general business resources.
INSERT INTO app.folders(id,kind,owner_id,name,parent_id)
SELECT id,'assets',(SELECT id FROM app.users WHERE username='marx'),name,parent_id
FROM (VALUES
 ('asset-folder-icons-people','人物角色','asset-folder-icons'),
 ('asset-folder-icons-data-tech','数据技术','asset-folder-icons'),
 ('asset-folder-vectors-people','人物角色','asset-folder-vectors'),
 ('asset-folder-vectors-data-tech','数据技术','asset-folder-vectors')
) AS planned(id,name,parent_id)
ON CONFLICT(id) DO NOTHING;
