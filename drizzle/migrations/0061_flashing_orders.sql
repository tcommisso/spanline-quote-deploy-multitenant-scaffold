CREATE TABLE IF NOT EXISTS `flashing_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `orderNumber` varchar(64) NOT NULL,
  `jobId` int DEFAULT NULL,
  `jobNumber` varchar(128) DEFAULT NULL,
  `clientName` varchar(255) DEFAULT NULL,
  `siteAddress` text,
  `supplierId` int DEFAULT NULL,
  `supplierName` varchar(255) DEFAULT NULL,
  `requestedByUserId` int DEFAULT NULL,
  `requestedByName` varchar(255) DEFAULT NULL,
  `requestedByEmail` varchar(320) DEFAULT NULL,
  `deliveryMethod` varchar(64) DEFAULT 'pickup',
  `requestedDeliveryAt` timestamp NULL DEFAULT NULL,
  `status` enum('draft','submitted','supplier_received','in_production','purchase_ordered','ready','completed','cancelled','archived') NOT NULL DEFAULT 'draft',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `lineCount` int NOT NULL DEFAULT 0,
  `totalGirthMm` decimal(12,2) DEFAULT '0.00',
  `totalLinealMetres` decimal(12,2) DEFAULT '0.00',
  `totalExGst` decimal(12,2) DEFAULT '0.00',
  `siteNotes` text,
  `internalNotes` text,
  `attachments` json DEFAULT NULL,
  `submittedAt` timestamp NULL DEFAULT NULL,
  `createdBy` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_flashing_orders_tenant_number` (`tenantId`, `orderNumber`),
  KEY `idx_flashing_orders_tenant_status` (`tenantId`, `status`),
  KEY `idx_flashing_orders_tenant_job` (`tenantId`, `jobId`),
  KEY `idx_flashing_orders_tenant_updated` (`tenantId`, `updatedAt`),
  KEY `idx_flashing_orders_supplier` (`supplierId`),
  KEY `idx_flashing_orders_requested_by` (`requestedByUserId`),
  KEY `idx_flashing_orders_created_by` (`createdBy`),
  CONSTRAINT `fk_flashing_orders_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flashing_orders_job`
    FOREIGN KEY (`jobId`) REFERENCES `construction_jobs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_flashing_orders_supplier`
    FOREIGN KEY (`supplierId`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_flashing_orders_requested_by`
    FOREIGN KEY (`requestedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_flashing_orders_created_by`
    FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `flashing_profile_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` varchar(128) DEFAULT 'custom',
  `geometry` json NOT NULL,
  `defaultMaterialType` varchar(128) DEFAULT NULL,
  `defaultGauge` varchar(64) DEFAULT NULL,
  `defaultColour` varchar(128) DEFAULT NULL,
  `defaultColourSide` enum('inside','outside','both','unspecified') NOT NULL DEFAULT 'unspecified',
  `defaultQuantity` int NOT NULL DEFAULT 1,
  `defaultLengthMm` decimal(12,2) DEFAULT '0.00',
  `supplierCompatibility` text,
  `notes` text,
  `tags` text,
  `version` int NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdBy` int DEFAULT NULL,
  `lastUsedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_flashing_templates_tenant_category` (`tenantId`, `category`),
  KEY `idx_flashing_templates_tenant_active` (`tenantId`, `isActive`),
  KEY `idx_flashing_templates_created_by` (`createdBy`),
  CONSTRAINT `fk_flashing_templates_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flashing_templates_created_by`
    FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `flashing_order_lines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `orderId` int NOT NULL,
  `templateId` int DEFAULT NULL,
  `lineNumber` int NOT NULL DEFAULT 1,
  `profileName` varchar(255) NOT NULL,
  `category` varchar(128) DEFAULT 'custom',
  `materialType` varchar(128) DEFAULT 'Colorbond',
  `gauge` varchar(64) DEFAULT NULL,
  `colour` varchar(128) DEFAULT NULL,
  `colourSide` enum('inside','outside','both','unspecified') NOT NULL DEFAULT 'unspecified',
  `finish` varchar(128) DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `lengthMm` decimal(12,2) DEFAULT '0.00',
  `totalLinealMetres` decimal(12,2) DEFAULT '0.00',
  `girthMm` decimal(12,2) DEFAULT '0.00',
  `bendCount` int NOT NULL DEFAULT 0,
  `unitPrice` decimal(12,2) DEFAULT '0.00',
  `lineTotal` decimal(12,2) DEFAULT '0.00',
  `geometry` json NOT NULL,
  `foldDetails` json DEFAULT NULL,
  `manufacturingNotes` text,
  `status` enum('draft','ready','needs_clarification','approved','in_production','completed','cancelled') NOT NULL DEFAULT 'draft',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_flashing_order_lines_order` (`orderId`),
  KEY `idx_flashing_order_lines_tenant` (`tenantId`),
  KEY `idx_flashing_order_lines_tenant_status` (`tenantId`, `status`),
  KEY `idx_flashing_order_lines_template` (`templateId`),
  CONSTRAINT `fk_flashing_order_lines_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flashing_order_lines_order`
    FOREIGN KEY (`orderId`) REFERENCES `flashing_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flashing_order_line_template`
    FOREIGN KEY (`templateId`) REFERENCES `flashing_profile_templates` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `flashing_order_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `orderId` int NOT NULL,
  `fromStatus` varchar(64) DEFAULT NULL,
  `toStatus` varchar(64) NOT NULL,
  `notes` text,
  `changedByUserId` int DEFAULT NULL,
  `changedByName` varchar(255) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_flashing_status_history_order` (`orderId`),
  KEY `idx_flashing_status_history_tenant` (`tenantId`),
  KEY `idx_flashing_status_history_changed_by` (`changedByUserId`),
  CONSTRAINT `fk_flashing_status_history_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flashing_status_history_order`
    FOREIGN KEY (`orderId`) REFERENCES `flashing_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flashing_status_history_changed_by`
    FOREIGN KEY (`changedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
