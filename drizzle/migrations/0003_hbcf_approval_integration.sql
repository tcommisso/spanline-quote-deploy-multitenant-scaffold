ALTER TABLE `quotes`
  ADD COLUMN IF NOT EXISTS `hbcfRequired` boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `hbcfRequirementReason` varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS `hbcfFlaggedAt` timestamp NULL;

ALTER TABLE `deck_quotes`
  ADD COLUMN IF NOT EXISTS `hbcfRequired` boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `hbcfRequirementReason` varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS `hbcfFlaggedAt` timestamp NULL;

ALTER TABLE `eclipse_quotes`
  ADD COLUMN IF NOT EXISTS `hbcfRequired` boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `hbcfRequirementReason` varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS `hbcfFlaggedAt` timestamp NULL;

ALTER TABLE `approval_projects`
  ADD COLUMN IF NOT EXISTS `hbcfRequired` boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `hbcfRequirementReason` varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS `hbcfStatus` varchar(32) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS `hbcfCertificateId` int NULL,
  ADD COLUMN IF NOT EXISTS `hbcfFlaggedAt` timestamp NULL;

UPDATE `approval_projects`
SET
  `hbcfRequired` = true,
  `hbcfStatus` = CASE WHEN `hbcfStatus` = 'not_required' THEN 'required' ELSE `hbcfStatus` END,
  `hbcfRequirementReason` = COALESCE(`hbcfRequirementReason`, 'Project value is at or above the $20,000 HBCF threshold'),
  `hbcfFlaggedAt` = COALESCE(`hbcfFlaggedAt`, NOW())
WHERE CAST(COALESCE(`estimatedCost`, '0') AS DECIMAL(14,2)) >= 20000;

UPDATE `deck_quotes`
SET
  `hbcfRequired` = true,
  `hbcfRequirementReason` = COALESCE(`hbcfRequirementReason`, 'Deck quote value is at or above the $20,000 HBCF threshold'),
  `hbcfFlaggedAt` = COALESCE(`hbcfFlaggedAt`, NOW())
WHERE CAST(COALESCE(`sellPriceExGst`, '0') AS DECIMAL(14,2)) >= 20000;

UPDATE `eclipse_quotes`
SET
  `hbcfRequired` = true,
  `hbcfRequirementReason` = COALESCE(`hbcfRequirementReason`, 'Eclipse quote value is at or above the $20,000 HBCF threshold'),
  `hbcfFlaggedAt` = COALESCE(`hbcfFlaggedAt`, NOW())
WHERE CAST(COALESCE(`totalSellPriceEx`, '0') AS DECIMAL(14,2)) >= 20000;

CREATE TABLE IF NOT EXISTS `hbcf_builder_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `builderName` varchar(255) NOT NULL,
  `tradingName` varchar(255) NULL,
  `abn` varchar(32) NULL,
  `licenceNumber` varchar(64) NULL,
  `insurerName` varchar(255) NULL,
  `annualLimit` decimal(14,2) NOT NULL DEFAULT '0',
  `annualLimitUsed` decimal(14,2) NOT NULL DEFAULT '0',
  `annualLimitYear` int NULL,
  `apiEnabled` boolean NOT NULL DEFAULT false,
  `apiBaseUrl` text NULL,
  `apiKeyRef` varchar(255) NULL,
  `apiMonthlyLimit` int NOT NULL DEFAULT 2500,
  `apiCallsThisMonth` int NOT NULL DEFAULT 0,
  `apiCallMonth` varchar(7) NULL,
  `lastSyncAt` timestamp NULL,
  `lastSyncStatus` varchar(32) NULL,
  `lastSyncError` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedByUserId` int NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hbcf_builder_profiles_tenant` (`tenantId`),
  KEY `idx_hbcf_builder_profiles_tenant` (`tenantId`),
  CONSTRAINT `fk_hbcf_builder_profiles_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_builder_profiles_user` FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `hbcf_certificates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `approvalProjectId` int NULL,
  `quoteId` int NULL,
  `crmLeadId` int NULL,
  `certificateNumber` varchar(128) NULL,
  `policyNumber` varchar(128) NULL,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `builderName` varchar(255) NULL,
  `builderLicenceNumber` varchar(64) NULL,
  `insurerName` varchar(255) NULL,
  `ownerName` varchar(255) NULL,
  `propertyAddress` text NULL,
  `propertySuburb` varchar(128) NULL,
  `propertyPostcode` varchar(10) NULL,
  `contractPrice` decimal(14,2) NULL,
  `issuedAt` timestamp NULL,
  `expiresAt` timestamp NULL,
  `certificateUrl` text NULL,
  `source` varchar(32) NOT NULL DEFAULT 'manual',
  `externalId` varchar(255) NULL,
  `rawPayload` json NULL,
  `lastSyncedAt` timestamp NULL,
  `syncStatus` varchar(32) NOT NULL DEFAULT 'not_synced',
  `syncError` text NULL,
  `notes` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdByUserId` int NULL,
  PRIMARY KEY (`id`),
  KEY `idx_hbcf_certificates_tenant` (`tenantId`),
  KEY `idx_hbcf_certificates_project` (`approvalProjectId`),
  KEY `idx_hbcf_certificates_quote` (`quoteId`),
  KEY `idx_hbcf_certificates_lead` (`crmLeadId`),
  KEY `idx_hbcf_certificates_policy` (`policyNumber`),
  KEY `idx_hbcf_certificates_status` (`status`),
  CONSTRAINT `fk_hbcf_certificates_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_certificates_project` FOREIGN KEY (`approvalProjectId`) REFERENCES `approval_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_certificates_quote` FOREIGN KEY (`quoteId`) REFERENCES `quotes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_certificates_lead` FOREIGN KEY (`crmLeadId`) REFERENCES `crm_leads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_certificates_user` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `hbcf_policy_matches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `leadId` int NULL,
  `quoteId` int NULL,
  `policyNumber` varchar(128) NULL,
  `certificateNumber` varchar(128) NULL,
  `builderName` varchar(255) NULL,
  `builderLicenceNumber` varchar(64) NULL,
  `insurerName` varchar(255) NULL,
  `ownerName` varchar(255) NULL,
  `propertyAddress` text NULL,
  `propertySuburb` varchar(128) NULL,
  `propertyPostcode` varchar(10) NULL,
  `contractPrice` decimal(14,2) NULL,
  `issuedAt` timestamp NULL,
  `isOurs` boolean NOT NULL DEFAULT false,
  `matchConfidence` enum('high','medium','low') NOT NULL DEFAULT 'medium',
  `matchReason` varchar(255) NULL,
  `source` varchar(32) NOT NULL DEFAULT 'api',
  `rawPayload` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hbcf_policy_matches_tenant` (`tenantId`),
  KEY `idx_hbcf_policy_matches_lead` (`leadId`),
  KEY `idx_hbcf_policy_matches_quote` (`quoteId`),
  KEY `idx_hbcf_policy_matches_policy` (`policyNumber`),
  KEY `idx_hbcf_policy_matches_builder` (`builderName`),
  KEY `idx_hbcf_policy_matches_is_ours` (`isOurs`),
  CONSTRAINT `fk_hbcf_policy_matches_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_policy_matches_lead` FOREIGN KEY (`leadId`) REFERENCES `crm_leads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hbcf_policy_matches_quote` FOREIGN KEY (`quoteId`) REFERENCES `quotes` (`id`) ON DELETE SET NULL
);
