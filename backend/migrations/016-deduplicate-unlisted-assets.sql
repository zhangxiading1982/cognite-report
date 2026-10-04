-- Asset archival is non-destructive: existing page and template references can still read it.
-- Keep one visible row for byte-identical, same-name images owned by the same user.
WITH ranked AS (
 SELECT a.id,row_number() OVER(
   PARTITION BY a.owner_id,a.kind,lower(a.name),o.sha256
   ORDER BY a.created_at,a.id
 ) AS duplicate_order
 FROM app.assets a
 JOIN app.storage_objects o ON o.id=a.original_object_id
 WHERE a.archived_at IS NULL AND a.kind='image' AND a.id NOT LIKE 'builtin-%'
)
UPDATE app.assets a SET archived_at=now()
FROM ranked r
WHERE a.id=r.id AND r.duplicate_order>1;
