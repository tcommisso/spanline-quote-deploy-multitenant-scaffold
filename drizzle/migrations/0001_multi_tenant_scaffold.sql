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

CREATE TABLE `tenant_integration_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `service` enum('domain','email','msgraph','nylas','vocphone','signwell','zapier','planning') NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `config` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_integration_service` (`tenantId`, `service`),
  KEY `idx_tenant_integration_tenant` (`tenantId`),
  CONSTRAINT `fk_tenant_integration_settings_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
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
ALTER TABLE `xero_budget_import_items` ADD COLUMN `projectState` varchar(64) NULL;
ALTER TABLE `user_dashboard_config` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_user_dashboard_config_tenantId` (`tenantId`);
ALTER TABLE `sms_messages` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_sms_messages_tenant` (`tenantId`), ADD KEY `idx_sms_messages_lead_tenant` (`tenantId`, `leadId`);
ALTER TABLE `call_logs` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_call_logs_tenant` (`tenantId`), ADD KEY `idx_call_logs_lead_tenant` (`tenantId`, `leadId`), ADD KEY `idx_call_logs_call_tenant` (`tenantId`, `vocphoneCallId`);
ALTER TABLE `vocphone_extensions` DROP INDEX `vocphone_extensions_extension_unique`;
ALTER TABLE `vocphone_extensions` ADD COLUMN `tenantId` int NULL, ADD UNIQUE KEY `uq_vocphone_extensions_tenant_extension` (`tenantId`, `extension`), ADD KEY `idx_vocphone_extensions_tenant` (`tenantId`);
ALTER TABLE `sms_templates` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_sms_templates_tenant` (`tenantId`);
ALTER TABLE `crm_appointments` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_crm_appointments_tenant` (`tenantId`), ADD KEY `idx_crm_appointments_lead_tenant` (`tenantId`, `leadId`);
ALTER TABLE `user_schedule_blocks` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_user_schedule_blocks_tenant` (`tenantId`), ADD KEY `idx_user_schedule_blocks_user_tenant` (`tenantId`, `userId`);
ALTER TABLE `user_time_off` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_user_time_off_tenant` (`tenantId`), ADD KEY `idx_user_time_off_user_tenant` (`tenantId`, `userId`);
ALTER TABLE `calendar_view_members` ADD COLUMN `tenantId` int NULL, ADD UNIQUE KEY `uq_calendar_view_members_tenant_view_user` (`tenantId`, `viewType`, `userId`), ADD KEY `idx_calendar_view_members_tenant` (`tenantId`);
ALTER TABLE `user_calendar_selections` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_user_calendar_selections_tenant` (`tenantId`), ADD KEY `idx_user_calendar_selections_user_tenant` (`tenantId`, `userId`);
ALTER TABLE `inbox_messages` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_inbox_messages_tenant` (`tenantId`), ADD KEY `idx_inbox_messages_thread_tenant` (`tenantId`, `threadId`);
ALTER TABLE `inbox_addresses` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_inbox_addresses_tenant` (`tenantId`);
ALTER TABLE `nylas_grants` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_nylas_grants_tenant` (`tenantId`), ADD KEY `idx_nylas_grants_user_tenant` (`tenantId`, `userId`);
ALTER TABLE `approval_projects` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_approval_projects_tenant` (`tenantId`);
ALTER TABLE `approval_integration_credentials` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_approval_integration_credentials_tenant` (`tenantId`);
ALTER TABLE `approval_sync_logs` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_approval_sync_logs_tenant` (`tenantId`);
ALTER TABLE `da_tracker_applications` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_da_tracker_tenant` (`tenantId`);
ALTER TABLE `da_tracker_webhook_subscriptions` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_da_tracker_subscription_tenant` (`tenantId`);
ALTER TABLE `da_tracker_webhook_deliveries` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_da_webhook_delivery_tenant` (`tenantId`);
ALTER TABLE `da_tracker_poll_log` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_da_tracker_poll_log_tenant` (`tenantId`);
ALTER TABLE `da_competitor_watchlist` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_da_competitor_watchlist_tenant` (`tenantId`);
ALTER TABLE `client_das` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_client_das_tenant` (`tenantId`);
ALTER TABLE `nsw_da_applications` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_nsw_da_tenant` (`tenantId`);
ALTER TABLE `nsw_da_poll_log` ADD COLUMN `tenantId` int NULL, ADD KEY `idx_nsw_da_poll_log_tenant` (`tenantId`);

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
ALTER TABLE `sms_messages` ADD CONSTRAINT `fk_sms_messages_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `call_logs` ADD CONSTRAINT `fk_call_logs_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `vocphone_extensions` ADD CONSTRAINT `fk_vocphone_extensions_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `sms_templates` ADD CONSTRAINT `fk_sms_templates_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `crm_appointments` ADD CONSTRAINT `fk_crm_appointments_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `user_schedule_blocks` ADD CONSTRAINT `fk_user_schedule_blocks_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `user_time_off` ADD CONSTRAINT `fk_user_time_off_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `calendar_view_members` ADD CONSTRAINT `fk_calendar_view_members_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `user_calendar_selections` ADD CONSTRAINT `fk_user_calendar_selections_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `inbox_messages` ADD CONSTRAINT `fk_inbox_messages_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `inbox_addresses` ADD CONSTRAINT `fk_inbox_addresses_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `nylas_grants` ADD CONSTRAINT `fk_nylas_grants_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `approval_projects` ADD CONSTRAINT `fk_approval_projects_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `approval_integration_credentials` ADD CONSTRAINT `fk_approval_integration_credentials_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `approval_sync_logs` ADD CONSTRAINT `fk_approval_sync_logs_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `da_tracker_applications` ADD CONSTRAINT `fk_da_tracker_applications_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `da_tracker_webhook_subscriptions` ADD CONSTRAINT `fk_da_tracker_webhook_subscriptions_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `da_tracker_webhook_deliveries` ADD CONSTRAINT `fk_da_tracker_webhook_deliveries_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `da_tracker_poll_log` ADD CONSTRAINT `fk_da_tracker_poll_log_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `da_competitor_watchlist` ADD CONSTRAINT `fk_da_competitor_watchlist_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `client_das` ADD CONSTRAINT `fk_client_das_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `nsw_da_applications` ADD CONSTRAINT `fk_nsw_da_applications_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);
ALTER TABLE `nsw_da_poll_log` ADD CONSTRAINT `fk_nsw_da_poll_log_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

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
  `ignoredAt` timestamp NULL,
  `ignoredByUserId` int NULL,
  `ignoreReason` varchar(255),
  `syncedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_xero_accounting_transactions_source` (`sourceKey`),
  KEY `idx_xero_accounting_transactions_connection` (`xeroConnectionId`),
  KEY `idx_xero_accounting_transactions_mapping` (`mappingId`),
  KEY `idx_xero_accounting_transactions_job` (`jobId`),
  KEY `idx_xero_accounting_transactions_tenant` (`appTenantId`),
  KEY `idx_xero_accounting_transactions_ignored` (`ignoredAt`),
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
UPDATE `sms_messages` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `call_logs` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `vocphone_extensions` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `sms_templates` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `crm_appointments` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `user_schedule_blocks` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `user_time_off` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `calendar_view_members` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `user_calendar_selections` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `inbox_messages` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `inbox_addresses` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
ALTER TABLE `inbox_addresses` MODIFY `provider` varchar(20) NOT NULL DEFAULT 'msgraph';
UPDATE `inbox_addresses` SET `provider` = 'msgraph' WHERE `provider` = 'resend';
UPDATE `nylas_grants` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `approval_projects` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `approval_integration_credentials` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `approval_sync_logs` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `da_tracker_applications` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `da_tracker_webhook_subscriptions` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `da_tracker_webhook_deliveries` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `da_tracker_poll_log` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `da_competitor_watchlist` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `client_das` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `nsw_da_applications` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;
UPDATE `nsw_da_poll_log` SET `tenantId` = @default_tenant_id WHERE `tenantId` IS NULL;

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
