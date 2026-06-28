SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `slug` = 'default'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
));

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  ORDER BY `id` ASC
  LIMIT 1
));

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'component_catalogue_products' AND column_name = 'tenantId') = 0,
  'ALTER TABLE `component_catalogue_products` ADD COLUMN `tenantId` int NULL AFTER `id`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `component_catalogue_products`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'component_catalogue_products' AND index_name = 'idx_component_catalogue_products_tenant_active') = 0,
  'ALTER TABLE `component_catalogue_products` ADD KEY `idx_component_catalogue_products_tenant_active` (`tenantId`, `isActive`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'component_catalogue_products' AND index_name = 'idx_component_catalogue_products_tenant_spa') = 0,
  'ALTER TABLE `component_catalogue_products` ADD KEY `idx_component_catalogue_products_tenant_spa` (`tenantId`, `spaCode`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
