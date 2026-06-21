CREATE TABLE IF NOT EXISTS `blind_fabric_colours` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `fabricRangeId` int NULL,
  `fabricRangeName` varchar(128) NULL,
  `categoryNumber` varchar(16) NULL,
  `name` varchar(128) NOT NULL,
  `hexCode` varchar(16) NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blind_fabric_colours_tenant_range_name` (`tenantId`, `fabricRangeId`, `name`),
  KEY `idx_blind_fabric_colours_tenant_category` (`tenantId`, `categoryNumber`),
  KEY `idx_blind_fabric_colours_tenant_range` (`tenantId`, `fabricRangeId`),
  CONSTRAINT `fk_blind_fabric_colours_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_blind_fabric_colours_range` FOREIGN KEY (`fabricRangeId`) REFERENCES `blind_glass_infill` (`id`) ON DELETE SET NULL
);

SET @migration_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'blind_quote_items' AND column_name = 'fabricColourId') = 0, 'ALTER TABLE `blind_quote_items` ADD COLUMN `fabricColourId` int NULL AFTER `glassInfillQuantity`', 'SELECT 1');
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'blind_quote_items' AND column_name = 'fabricColourName') = 0, 'ALTER TABLE `blind_quote_items` ADD COLUMN `fabricColourName` varchar(128) NULL AFTER `fabricColourId`', 'SELECT 1');
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'blind_quote_items' AND index_name = 'idx_blind_items_fabric_colour') = 0, 'ALTER TABLE `blind_quote_items` ADD KEY `idx_blind_items_fabric_colour` (`fabricColourId`)', 'SELECT 1');
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'blind_quote_items' AND constraint_name = 'fk_blind_items_fabric_colour') = 0, 'ALTER TABLE `blind_quote_items` ADD CONSTRAINT `fk_blind_items_fabric_colour` FOREIGN KEY (`fabricColourId`) REFERENCES `blind_fabric_colours` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
