CREATE TABLE `tenants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `status` enum('active','suspended','archived') NOT NULL DEFAULT 'active',
  `primaryDomain` varchar(255),
  `allowedOrigins` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_unique` (`slug`)
);

CREATE TABLE `tenant_memberships` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('owner','admin','member','billing') NOT NULL DEFAULT 'member',
  `isDefault` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_membership_user` (`tenantId`, `userId`),
  KEY `idx_tenant_membership_user` (`userId`),
  CONSTRAINT `fk_tenant_memberships_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tenant_memberships_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE `tenant_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `companyDetails` json,
  `branding` json,
  `featureFlags` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_settings_tenantId_unique` (`tenantId`),
  CONSTRAINT `fk_tenant_settings_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);

ALTER TABLE `quotes` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_quotes_tenantId` (`tenantId`);
ALTER TABLE `crm_leads` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_crm_leads_tenantId` (`tenantId`);
ALTER TABLE `design_advisors` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_design_advisors_tenantId` (`tenantId`);
ALTER TABLE `construction_installers` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_construction_installers_tenantId` (`tenantId`);
ALTER TABLE `construction_jobs` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_construction_jobs_tenantId` (`tenantId`);
ALTER TABLE `manufacturing_drivers` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_manufacturing_drivers_tenantId` (`tenantId`);
ALTER TABLE `equipment` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_equipment_tenantId` (`tenantId`);
ALTER TABLE `suppliers` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_suppliers_tenantId` (`tenantId`);
ALTER TABLE `supplier_categories` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_supplier_categories_tenantId` (`tenantId`);
ALTER TABLE `inventory_stock_items` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_inventory_stock_items_tenantId` (`tenantId`);
ALTER TABLE `inventory_movements` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_inventory_movements_tenantId` (`tenantId`);
ALTER TABLE `inventory_transfers` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_inventory_transfers_tenantId` (`tenantId`);
ALTER TABLE `stocktakes` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_stocktakes_tenantId` (`tenantId`);
ALTER TABLE `permission_audit_log` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_permission_audit_log_tenantId` (`tenantId`);
ALTER TABLE `portal_access` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_portal_access_tenantId` (`tenantId`);
ALTER TABLE `trade_portal_access` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_trade_portal_access_tenantId` (`tenantId`);
ALTER TABLE `invitations` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_invitations_tenantId` (`tenantId`);
ALTER TABLE `xero_connections` ADD COLUMN `appTenantId` int NULL, ADD KEY `idx_xero_connections_appTenantId` (`appTenantId`);
ALTER TABLE `xero_cost_import_batches` ADD COLUMN `appTenantId` int NULL, ADD KEY `idx_xero_cost_import_batches_appTenantId` (`appTenantId`);
ALTER TABLE `xero_cost_import_items` ADD COLUMN `appTenantId` int NULL, ADD KEY `idx_xero_cost_import_items_appTenantId` (`appTenantId`);
ALTER TABLE `xero_budget_import_batches` ADD COLUMN `appTenantId` int NULL, ADD KEY `idx_xero_budget_import_batches_appTenantId` (`appTenantId`);
ALTER TABLE `xero_budget_import_items` ADD COLUMN `appTenantId` int NULL, ADD KEY `idx_xero_budget_import_items_appTenantId` (`appTenantId`);
ALTER TABLE `user_dashboard_config` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_user_dashboard_config_tenantId` (`tenantId`);

ALTER TABLE `quotes` ADD CONSTRAINT `fk_quotes_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `crm_leads` ADD CONSTRAINT `fk_crm_leads_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `design_advisors` ADD CONSTRAINT `fk_design_advisors_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `construction_installers` ADD CONSTRAINT `fk_construction_installers_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `construction_jobs` ADD CONSTRAINT `fk_construction_jobs_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `manufacturing_drivers` ADD CONSTRAINT `fk_manufacturing_drivers_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `equipment` ADD CONSTRAINT `fk_equipment_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `suppliers` ADD CONSTRAINT `fk_suppliers_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `supplier_categories` ADD CONSTRAINT `fk_supplier_categories_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `inventory_stock_items` ADD CONSTRAINT `fk_inventory_stock_items_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `inventory_movements` ADD CONSTRAINT `fk_inventory_movements_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `inventory_transfers` ADD CONSTRAINT `fk_inventory_transfers_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `stocktakes` ADD CONSTRAINT `fk_stocktakes_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `permission_audit_log` ADD CONSTRAINT `fk_permission_audit_log_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `portal_access` ADD CONSTRAINT `fk_portal_access_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `trade_portal_access` ADD CONSTRAINT `fk_trade_portal_access_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `invitations` ADD CONSTRAINT `fk_invitations_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `xero_connections` ADD CONSTRAINT `fk_xero_connections_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `xero_cost_import_batches` ADD CONSTRAINT `fk_xero_cost_import_batches_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `xero_cost_import_items` ADD CONSTRAINT `fk_xero_cost_import_items_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `xero_budget_import_batches` ADD CONSTRAINT `fk_xero_budget_import_batches_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `xero_budget_import_items` ADD CONSTRAINT `fk_xero_budget_import_items_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `user_dashboard_config` ADD CONSTRAINT `fk_user_dashboard_config_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

CREATE TABLE `xero_accounting_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appTenantId` int NULL,
  `xeroConnectionId` int NOT NULL,
  `mappingId` int NULL,
  `jobId` int NULL,
  `sourceKey` varchar(255) NOT NULL,
  `sourceType` enum('invoice','bill','bank_transaction','payment','credit_note','manual_journal') NOT NULL,
  `xeroTransactionId` varchar(128) NOT NULL,
  `xeroLineItemId` varchar(128),
  `transactionNumber` varchar(128),
  `contactId` varchar(128),
  `contactName` varchar(255),
  `transactionDate` varchar(32),
  `dueDate` varchar(32),
  `status` varchar(64),
  `reference` varchar(512),
  `description` text,
  `accountCode` varchar(64),
  `trackingCategoryName` varchar(128),
  `trackingOptionName` varchar(255),
  `matchMethod` enum('tracking','reference','description','contact','manual','unmatched') NOT NULL DEFAULT 'unmatched',
  `costCategory` enum('materials','labour','other','revenue') NOT NULL DEFAULT 'other',
  `lineAmount` decimal(12,4) NOT NULL DEFAULT '0',
  `taxAmount` decimal(12,4) NOT NULL DEFAULT '0',
  `grossAmount` decimal(12,4) NOT NULL DEFAULT '0',
  `amountPaid` decimal(12,4) DEFAULT '0',
  `amountDue` decimal(12,4) DEFAULT '0',
  `currencyCode` varchar(8),
  `isCost` boolean NOT NULL DEFAULT false,
  `isRevenue` boolean NOT NULL DEFAULT false,
  `raw` json,
  `syncedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_xero_accounting_transactions_source` (`sourceKey`),
  KEY `idx_xero_accounting_transactions_connection` (`xeroConnectionId`),
  KEY `idx_xero_accounting_transactions_mapping` (`mappingId`),
  KEY `idx_xero_accounting_transactions_job` (`jobId`),
  KEY `idx_xero_accounting_transactions_tenant` (`appTenantId`),
  CONSTRAINT `fk_xero_accounting_transactions_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_xero_accounting_transactions_connection` FOREIGN KEY (`xeroConnectionId`) REFERENCES `xero_connections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_xero_accounting_transactions_mapping` FOREIGN KEY (`mappingId`) REFERENCES `xero_project_mappings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_xero_accounting_transactions_job` FOREIGN KEY (`jobId`) REFERENCES `construction_jobs` (`id`) ON DELETE SET NULL
);

CREATE TABLE `xero_webhook_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appTenantId` int NULL,
  `xeroConnectionId` int NULL,
  `syncLogId` int NULL,
  `xeroTenantId` varchar(128),
  `tenantType` varchar(64),
  `eventId` varchar(255) NOT NULL,
  `eventCategory` varchar(64),
  `eventType` varchar(64),
  `resourceId` varchar(128),
  `resourceUrl` varchar(1024),
  `eventDateUtc` timestamp NULL,
  `firstEventSequence` int NULL,
  `lastEventSequence` int NULL,
  `status` enum('received','queued','processing','processed','skipped','failed') NOT NULL DEFAULT 'received',
  `errorMessage` text,
  `payload` json,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_xero_webhook_events_event_id` (`eventId`),
  KEY `idx_xero_webhook_events_connection` (`xeroConnectionId`),
  KEY `idx_xero_webhook_events_tenant` (`appTenantId`),
  KEY `idx_xero_webhook_events_status` (`status`),
  CONSTRAINT `fk_xero_webhook_events_app_tenant` FOREIGN KEY (`appTenantId`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_xero_webhook_events_connection` FOREIGN KEY (`xeroConnectionId`) REFERENCES `xero_connections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_xero_webhook_events_sync_log` FOREIGN KEY (`syncLogId`) REFERENCES `xero_sync_logs` (`id`) ON DELETE SET NULL
);

INSERT INTO `tenants` (`slug`, `name`, `status`, `createdAt`, `updatedAt`)
VALUES ('default', 'Default Tenant', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

SET @default_tenant_id := (SELECT `id` FROM `tenants` WHERE `slug` = 'default' LIMIT 1);

UPDATE `quotes` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `crm_leads` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `design_advisors` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `construction_installers` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `construction_jobs` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `manufacturing_drivers` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `equipment` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `suppliers` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `supplier_categories` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `inventory_stock_items` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `inventory_movements` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `inventory_transfers` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `stocktakes` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `permission_audit_log` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `portal_access` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `trade_portal_access` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `invitations` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `xero_connections` SET `appTenantId` = @default_tenant_id WHERE `appTenantId` IS NULL;
UPDATE `xero_cost_import_batches` SET `appTenantId` = @default_tenant_id WHERE `appTenantId` IS NULL;
UPDATE `xero_cost_import_items` SET `appTenantId` = @default_tenant_id WHERE `appTenantId` IS NULL;
UPDATE `xero_budget_import_batches` SET `appTenantId` = @default_tenant_id WHERE `appTenantId` IS NULL;
UPDATE `xero_budget_import_items` SET `appTenantId` = @default_tenant_id WHERE `appTenantId` IS NULL;
UPDATE `user_dashboard_config` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;

INSERT INTO `tenant_memberships` (`tenantId`, `userId`, `role`, `isDefault`, `createdAt`, `updatedAt`)
SELECT
  @default_tenant_id,
  `id`,
  CASE
    WHEN `role` = 'super_admin' THEN 'owner'
    WHEN `role` = 'admin' THEN 'admin'
    ELSE 'member'
  END,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `users`
ON DUPLICATE KEY UPDATE
  `role` = VALUES(`role`),
  `isDefault` = true,
  `updatedAt` = CURRENT_TIMESTAMP;
