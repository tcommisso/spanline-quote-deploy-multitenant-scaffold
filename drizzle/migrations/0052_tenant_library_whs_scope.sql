SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  ORDER BY `id` ASC
  LIMIT 1
));

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tech_library_documents' AND column_name = 'tenantId') = 0,
  'ALTER TABLE `tech_library_documents` ADD COLUMN `tenantId` int NULL',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tech_library_documents' AND index_name = 'idx_tech_library_documents_tenant') = 0,
  'ALTER TABLE `tech_library_documents` ADD KEY `idx_tech_library_documents_tenant` (`tenantId`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tech_library_documents' AND index_name = 'idx_tech_library_documents_tenant_active') = 0,
  'ALTER TABLE `tech_library_documents` ADD KEY `idx_tech_library_documents_tenant_active` (`tenantId`, `active`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `tech_library_documents`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tech_library_documents' AND constraint_name = 'fk_tech_library_documents_tenant') = 0,
  'ALTER TABLE `tech_library_documents` ADD CONSTRAINT `fk_tech_library_documents_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'swms_documents' AND column_name = 'tenantId') = 0,
  'ALTER TABLE `swms_documents` ADD COLUMN `tenantId` int NULL',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'swms_documents' AND index_name = 'idx_swms_documents_tenant') = 0,
  'ALTER TABLE `swms_documents` ADD KEY `idx_swms_documents_tenant` (`tenantId`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'swms_documents' AND index_name = 'idx_swms_documents_tenant_active') = 0,
  'ALTER TABLE `swms_documents` ADD KEY `idx_swms_documents_tenant_active` (`tenantId`, `isActive`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `swms_documents`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'swms_documents' AND constraint_name = 'fk_swms_documents_tenant') = 0,
  'ALTER TABLE `swms_documents` ADD CONSTRAINT `fk_swms_documents_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
