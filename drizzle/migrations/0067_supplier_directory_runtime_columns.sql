SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'tenantId') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `tenantId` int NULL AFTER `id`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'abn') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `abn` varchar(20) NULL AFTER `name`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'contactName') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `contactName` varchar(255) NULL AFTER `abn`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'phone') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `phone` varchar(64) NULL AFTER `contactName`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'email') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `email` varchar(320) NULL AFTER `phone`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'address') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `address` text NULL AFTER `email`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'category') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `category` varchar(128) NULL AFTER `address`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'supplierScope') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `supplierScope` varchar(32) NOT NULL DEFAULT ''construction'' AFTER `category`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `suppliers`
SET `supplierScope` = 'construction'
WHERE `supplierScope` IS NULL OR `supplierScope` = '';

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'paymentTerms') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `paymentTerms` varchar(100) NULL AFTER `supplierScope`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'defaultGlCode') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `defaultGlCode` varchar(50) NULL AFTER `paymentTerms`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'notes') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `notes` text NULL AFTER `defaultGlCode`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'xeroContactId') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `xeroContactId` varchar(128) NULL AFTER `notes`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'xeroConnectionId') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `xeroConnectionId` int NULL AFTER `xeroContactId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'xeroTenantId') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `xeroTenantId` varchar(128) NULL AFTER `xeroConnectionId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'lastXeroSyncAt') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `lastXeroSyncAt` timestamp NULL DEFAULT NULL AFTER `xeroTenantId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'tradePortalFlashingOrdersEnabled') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `tradePortalFlashingOrdersEnabled` boolean NOT NULL DEFAULT false AFTER `lastXeroSyncAt`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'isActive') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `isActive` boolean NOT NULL DEFAULT true AFTER `tradePortalFlashingOrdersEnabled`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'createdBy') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `createdBy` int NULL AFTER `isActive`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'createdAt') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `createdBy`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'updatedAt') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `createdAt`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND index_name = 'idx_suppliers_tenant_scope_active') = 0,
  'ALTER TABLE `suppliers` ADD KEY `idx_suppliers_tenant_scope_active` (`tenantId`, `supplierScope`, `isActive`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND index_name = 'idx_suppliers_xero_contact') = 0,
  'ALTER TABLE `suppliers` ADD KEY `idx_suppliers_xero_contact` (`xeroConnectionId`, `xeroContactId`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
