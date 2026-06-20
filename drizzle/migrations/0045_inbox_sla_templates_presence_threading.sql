ALTER TABLE `inbox_messages`
  ADD COLUMN IF NOT EXISTS `graphConversationId` varchar(512) NULL AFTER `graphMessageId`;

ALTER TABLE `inbox_tickets`
  ADD COLUMN IF NOT EXISTS `graphConversationId` varchar(512) NULL AFTER `threadId`,
  ADD COLUMN IF NOT EXISTS `slaRuleId` int NULL AFTER `slaBreachedAt`,
  ADD COLUMN IF NOT EXISTS `slaMetric` enum('first_response','next_response','resolution') NULL AFTER `slaRuleId`,
  ADD COLUMN IF NOT EXISTS `slaFirstResponseDueAt` timestamp NULL DEFAULT NULL AFTER `slaMetric`,
  ADD COLUMN IF NOT EXISTS `slaNextResponseDueAt` timestamp NULL DEFAULT NULL AFTER `slaFirstResponseDueAt`,
  ADD COLUMN IF NOT EXISTS `slaResolutionDueAt` timestamp NULL DEFAULT NULL AFTER `slaNextResponseDueAt`;

ALTER TABLE `inbox_sla_rules`
  ADD COLUMN IF NOT EXISTS `queue` varchar(50) NULL AFTER `name`,
  ADD COLUMN IF NOT EXISTS `priority` enum('low','normal','high','urgent') NULL AFTER `queue`,
  ADD COLUMN IF NOT EXISTS `firstResponseHours` int NOT NULL DEFAULT 4 AFTER `priority`,
  ADD COLUMN IF NOT EXISTS `nextResponseHours` int NOT NULL DEFAULT 24 AFTER `firstResponseHours`,
  ADD COLUMN IF NOT EXISTS `resolutionHours` int NOT NULL DEFAULT 72 AFTER `nextResponseHours`;

CREATE TABLE IF NOT EXISTS `inbox_reply_templates` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NULL,
  `name` varchar(100) NOT NULL,
  `queue` varchar(50) NULL,
  `category` varchar(80) NULL,
  `subject` varchar(255) NULL,
  `bodyHtml` mediumtext NOT NULL,
  `bodyText` mediumtext NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdBy` int NULL,
  `createdByName` varchar(100) NULL,
  `updatedBy` int NULL,
  `updatedByName` varchar(100) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_inbox_reply_templates_tenant` (`tenantId`),
  KEY `idx_inbox_reply_templates_tenant_active` (`tenantId`, `active`),
  KEY `idx_inbox_reply_templates_tenant_queue` (`tenantId`, `queue`)
);

CREATE TABLE IF NOT EXISTS `inbox_ticket_presence` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NULL,
  `threadId` varchar(128) NOT NULL,
  `userId` int NOT NULL,
  `userName` varchar(100) NULL,
  `mode` enum('viewing','replying') NOT NULL DEFAULT 'viewing',
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_inbox_ticket_presence_tenant_thread_user` (`tenantId`, `threadId`, `userId`),
  KEY `idx_inbox_ticket_presence_tenant_thread` (`tenantId`, `threadId`)
);
