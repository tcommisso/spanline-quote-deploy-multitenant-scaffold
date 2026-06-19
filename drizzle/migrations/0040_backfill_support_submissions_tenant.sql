SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  ORDER BY (`status` = 'active') DESC, `id` ASC
  LIMIT 1
);

UPDATE `support_submissions`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;
