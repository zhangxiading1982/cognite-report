-- Add business-scene photo directories used by the expanded built-in catalog.
INSERT INTO app.folders(id,kind,owner_id,name,parent_id)
SELECT id,'assets',(SELECT id FROM app.users WHERE username='marx'),name,'asset-folder-images'
FROM (VALUES
 ('asset-folder-images-office','办公商务'),
 ('asset-folder-images-logistics','物流供应链'),
 ('asset-folder-images-industry','科技制造'),
 ('asset-folder-images-sustainability','可持续发展')
) AS planned(id,name)
ON CONFLICT(id) DO NOTHING;
