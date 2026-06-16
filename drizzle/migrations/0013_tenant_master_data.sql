SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  ORDER BY (`status` = 'active') DESC, `id` ASC
  LIMIT 1
);

ALTER TABLE `master_data`
  ADD COLUMN `tenantId` int NULL AFTER `id`,
  ADD KEY `idx_master_data_tenant` (`tenantId`),
  ADD KEY `idx_master_data_tenant_category` (`tenantId`, `category`);

UPDATE `master_data`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

ALTER TABLE `master_data`
  ADD CONSTRAINT `fk_master_data_tenant`
  FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;
