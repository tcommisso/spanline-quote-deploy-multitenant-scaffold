CREATE TABLE IF NOT EXISTS `ss_pricing_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `defaultMarkupPercent` decimal(5,2) NOT NULL DEFAULT '30.00',
  `updatedBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ss_pricing_settings_tenant` (`tenantId`),
  KEY `idx_ss_pricing_settings_tenant` (`tenantId`),
  CONSTRAINT `fk_ss_pricing_settings_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_pricing_settings_user` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `ss_pricing_matrix` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `brand` varchar(64) NOT NULL,
  `productType` varchar(64) NOT NULL,
  `heightMm` int NOT NULL,
  `widthMm` int NOT NULL,
  `priceIncGst` decimal(12,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ss_matrix_tenant_size` (`tenantId`, `brand`, `productType`, `heightMm`, `widthMm`),
  KEY `idx_ss_matrix_tenant_brand_type` (`tenantId`, `brand`, `productType`),
  CONSTRAINT `fk_ss_matrix_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `ss_price_adjustments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `effectiveDate` varchar(10) NOT NULL,
  `percentageIncrease` decimal(6,2) NOT NULL,
  `description` text NULL,
  `createdBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_adjustments_tenant_date` (`tenantId`, `effectiveDate`),
  CONSTRAINT `fk_ss_adjustments_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_adjustments_user` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `ss_cost_additions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `category` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text NULL,
  `cost` decimal(12,2) NOT NULL,
  `uom` varchar(32) NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_costs_tenant_category` (`tenantId`, `category`),
  CONSTRAINT `fk_ss_costs_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `ss_product_options` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `category` varchar(64) NOT NULL,
  `orderCode` varchar(100) NULL,
  `name` varchar(255) NOT NULL,
  `description` text NULL,
  `brand` varchar(64) NULL,
  `costPrice` decimal(12,2) NOT NULL,
  `sellPrice` decimal(12,2) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_options_tenant_category` (`tenantId`, `category`),
  CONSTRAINT `fk_ss_options_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `ss_glass_infill` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `glassType` varchar(128) NOT NULL,
  `description` text NULL,
  `cost` decimal(12,2) NOT NULL,
  `uom` varchar(32) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_glass_tenant` (`tenantId`),
  CONSTRAINT `fk_ss_glass_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `ss_colours` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `name` varchar(128) NOT NULL,
  `hexCode` varchar(16) NOT NULL,
  `colorbondName` varchar(128) NULL,
  `surchargePercent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_ss_colours_tenant_sort` (`tenantId`, `sortOrder`),
  CONSTRAINT `fk_ss_colours_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `ss_quotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `quoteNumber` varchar(32) NOT NULL,
  `clientName` varchar(255) NOT NULL,
  `clientEmail` varchar(320) NULL,
  `clientPhone` varchar(64) NULL,
  `siteAddress` text NULL,
  `markupPercent` decimal(5,2) NOT NULL DEFAULT '30.00',
  `status` enum('draft','sent','accepted','declined','expired') NOT NULL DEFAULT 'draft',
  `subtotalExGst` decimal(12,2) NOT NULL DEFAULT '0.00',
  `gstAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `totalIncGst` decimal(12,2) NOT NULL DEFAULT '0.00',
  `notes` text NULL,
  `leadId` int NULL,
  `createdBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ss_quote_tenant_number` (`tenantId`, `quoteNumber`),
  KEY `idx_ss_quotes_tenant_status` (`tenantId`, `status`),
  KEY `idx_ss_quotes_lead` (`leadId`),
  CONSTRAINT `fk_ss_quotes_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_quotes_lead` FOREIGN KEY (`leadId`) REFERENCES `crm_leads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ss_quotes_user` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `ss_quote_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `quoteId` int NOT NULL,
  `itemNumber` int NOT NULL,
  `brand` varchar(64) NOT NULL,
  `productType` varchar(64) NOT NULL,
  `widthMm` int NOT NULL,
  `heightMm` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `colourId` int NULL,
  `colourName` varchar(128) NULL,
  `handleSide` varchar(32) NULL,
  `hingeSide` varchar(32) NULL,
  `openingDirection` varchar(32) NULL,
  `hingePosition` varchar(32) NULL,
  `glassInfillId` int NULL,
  `photoUrl` text NULL,
  `notes` text NULL,
  `basePriceIncGst` decimal(12,2) NOT NULL DEFAULT '0.00',
  `adjustedPrice` decimal(12,2) NOT NULL DEFAULT '0.00',
  `optionsTotal` decimal(12,2) NOT NULL DEFAULT '0.00',
  `lineTotalExGst` decimal(12,2) NOT NULL DEFAULT '0.00',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_items_tenant_quote` (`tenantId`, `quoteId`),
  KEY `idx_ss_items_quote` (`quoteId`),
  CONSTRAINT `fk_ss_items_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_items_quote` FOREIGN KEY (`quoteId`) REFERENCES `ss_quotes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_items_colour` FOREIGN KEY (`colourId`) REFERENCES `ss_colours` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ss_items_glass` FOREIGN KEY (`glassInfillId`) REFERENCES `ss_glass_infill` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `ss_quote_item_options` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `quoteItemId` int NOT NULL,
  `productOptionId` int NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `unitPrice` decimal(12,2) NOT NULL,
  `lineTotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ss_item_options_tenant_item` (`tenantId`, `quoteItemId`),
  CONSTRAINT `fk_ss_item_options_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_item_options_item` FOREIGN KEY (`quoteItemId`) REFERENCES `ss_quote_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_item_options_option` FOREIGN KEY (`productOptionId`) REFERENCES `ss_product_options` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `ss_quote_cost_additions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `quoteId` int NOT NULL,
  `costAdditionId` int NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT '1.00',
  `unitCost` decimal(12,2) NOT NULL,
  `lineTotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ss_quote_costs_tenant_quote` (`tenantId`, `quoteId`),
  CONSTRAINT `fk_ss_quote_costs_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_quote_costs_quote` FOREIGN KEY (`quoteId`) REFERENCES `ss_quotes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_quote_costs_cost` FOREIGN KEY (`costAdditionId`) REFERENCES `ss_cost_additions` (`id`) ON DELETE SET NULL
);

INSERT INTO `ss_pricing_settings` (`tenantId`, `defaultMarkupPercent`)
SELECT `id`, '30.00'
FROM `tenants`
WHERE NOT EXISTS (
  SELECT 1 FROM `ss_pricing_settings` WHERE `ss_pricing_settings`.`tenantId` = `tenants`.`id`
);
