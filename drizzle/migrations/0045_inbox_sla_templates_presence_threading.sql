SET @inbox_messages_graph_conversation_id_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_messages'
    AND `COLUMN_NAME` = 'graphConversationId'
);
SET @inbox_messages_graph_conversation_id_col_sql := IF(
  @inbox_messages_graph_conversation_id_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_messages` ADD COLUMN `graphConversationId` varchar(512) NULL AFTER `graphMessageId`'
);
PREPARE inbox_messages_graph_conversation_id_col_stmt FROM @inbox_messages_graph_conversation_id_col_sql;
EXECUTE inbox_messages_graph_conversation_id_col_stmt;
DEALLOCATE PREPARE inbox_messages_graph_conversation_id_col_stmt;

SET @inbox_tickets_graph_conversation_id_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'graphConversationId'
);
SET @inbox_tickets_graph_conversation_id_col_sql := IF(
  @inbox_tickets_graph_conversation_id_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `graphConversationId` varchar(512) NULL AFTER `threadId`'
);
PREPARE inbox_tickets_graph_conversation_id_col_stmt FROM @inbox_tickets_graph_conversation_id_col_sql;
EXECUTE inbox_tickets_graph_conversation_id_col_stmt;
DEALLOCATE PREPARE inbox_tickets_graph_conversation_id_col_stmt;

SET @inbox_tickets_sla_rule_id_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'slaRuleId'
);
SET @inbox_tickets_sla_rule_id_col_sql := IF(
  @inbox_tickets_sla_rule_id_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `slaRuleId` int NULL AFTER `slaBreachedAt`'
);
PREPARE inbox_tickets_sla_rule_id_col_stmt FROM @inbox_tickets_sla_rule_id_col_sql;
EXECUTE inbox_tickets_sla_rule_id_col_stmt;
DEALLOCATE PREPARE inbox_tickets_sla_rule_id_col_stmt;

SET @inbox_tickets_sla_metric_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'slaMetric'
);
SET @inbox_tickets_sla_metric_col_sql := IF(
  @inbox_tickets_sla_metric_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `slaMetric` enum(''first_response'',''next_response'',''resolution'') NULL AFTER `slaRuleId`'
);
PREPARE inbox_tickets_sla_metric_col_stmt FROM @inbox_tickets_sla_metric_col_sql;
EXECUTE inbox_tickets_sla_metric_col_stmt;
DEALLOCATE PREPARE inbox_tickets_sla_metric_col_stmt;

SET @inbox_tickets_sla_first_response_due_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'slaFirstResponseDueAt'
);
SET @inbox_tickets_sla_first_response_due_col_sql := IF(
  @inbox_tickets_sla_first_response_due_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `slaFirstResponseDueAt` timestamp NULL DEFAULT NULL AFTER `slaMetric`'
);
PREPARE inbox_tickets_sla_first_response_due_col_stmt FROM @inbox_tickets_sla_first_response_due_col_sql;
EXECUTE inbox_tickets_sla_first_response_due_col_stmt;
DEALLOCATE PREPARE inbox_tickets_sla_first_response_due_col_stmt;

SET @inbox_tickets_sla_next_response_due_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'slaNextResponseDueAt'
);
SET @inbox_tickets_sla_next_response_due_col_sql := IF(
  @inbox_tickets_sla_next_response_due_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `slaNextResponseDueAt` timestamp NULL DEFAULT NULL AFTER `slaFirstResponseDueAt`'
);
PREPARE inbox_tickets_sla_next_response_due_col_stmt FROM @inbox_tickets_sla_next_response_due_col_sql;
EXECUTE inbox_tickets_sla_next_response_due_col_stmt;
DEALLOCATE PREPARE inbox_tickets_sla_next_response_due_col_stmt;

SET @inbox_tickets_sla_resolution_due_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'slaResolutionDueAt'
);
SET @inbox_tickets_sla_resolution_due_col_sql := IF(
  @inbox_tickets_sla_resolution_due_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `slaResolutionDueAt` timestamp NULL DEFAULT NULL AFTER `slaNextResponseDueAt`'
);
PREPARE inbox_tickets_sla_resolution_due_col_stmt FROM @inbox_tickets_sla_resolution_due_col_sql;
EXECUTE inbox_tickets_sla_resolution_due_col_stmt;
DEALLOCATE PREPARE inbox_tickets_sla_resolution_due_col_stmt;

SET @inbox_sla_rules_queue_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_sla_rules'
    AND `COLUMN_NAME` = 'queue'
);
SET @inbox_sla_rules_queue_col_sql := IF(
  @inbox_sla_rules_queue_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_sla_rules` ADD COLUMN `queue` varchar(50) NULL AFTER `name`'
);
PREPARE inbox_sla_rules_queue_col_stmt FROM @inbox_sla_rules_queue_col_sql;
EXECUTE inbox_sla_rules_queue_col_stmt;
DEALLOCATE PREPARE inbox_sla_rules_queue_col_stmt;

SET @inbox_sla_rules_priority_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_sla_rules'
    AND `COLUMN_NAME` = 'priority'
);
SET @inbox_sla_rules_priority_col_sql := IF(
  @inbox_sla_rules_priority_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_sla_rules` ADD COLUMN `priority` enum(''low'',''normal'',''high'',''urgent'') NULL AFTER `queue`'
);
PREPARE inbox_sla_rules_priority_col_stmt FROM @inbox_sla_rules_priority_col_sql;
EXECUTE inbox_sla_rules_priority_col_stmt;
DEALLOCATE PREPARE inbox_sla_rules_priority_col_stmt;

SET @inbox_sla_rules_first_response_hours_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_sla_rules'
    AND `COLUMN_NAME` = 'firstResponseHours'
);
SET @inbox_sla_rules_first_response_hours_col_sql := IF(
  @inbox_sla_rules_first_response_hours_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_sla_rules` ADD COLUMN `firstResponseHours` int NOT NULL DEFAULT 4 AFTER `priority`'
);
PREPARE inbox_sla_rules_first_response_hours_col_stmt FROM @inbox_sla_rules_first_response_hours_col_sql;
EXECUTE inbox_sla_rules_first_response_hours_col_stmt;
DEALLOCATE PREPARE inbox_sla_rules_first_response_hours_col_stmt;

SET @inbox_sla_rules_next_response_hours_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_sla_rules'
    AND `COLUMN_NAME` = 'nextResponseHours'
);
SET @inbox_sla_rules_next_response_hours_col_sql := IF(
  @inbox_sla_rules_next_response_hours_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_sla_rules` ADD COLUMN `nextResponseHours` int NOT NULL DEFAULT 24 AFTER `firstResponseHours`'
);
PREPARE inbox_sla_rules_next_response_hours_col_stmt FROM @inbox_sla_rules_next_response_hours_col_sql;
EXECUTE inbox_sla_rules_next_response_hours_col_stmt;
DEALLOCATE PREPARE inbox_sla_rules_next_response_hours_col_stmt;

SET @inbox_sla_rules_resolution_hours_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_sla_rules'
    AND `COLUMN_NAME` = 'resolutionHours'
);
SET @inbox_sla_rules_resolution_hours_col_sql := IF(
  @inbox_sla_rules_resolution_hours_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_sla_rules` ADD COLUMN `resolutionHours` int NOT NULL DEFAULT 72 AFTER `nextResponseHours`'
);
PREPARE inbox_sla_rules_resolution_hours_col_stmt FROM @inbox_sla_rules_resolution_hours_col_sql;
EXECUTE inbox_sla_rules_resolution_hours_col_stmt;
DEALLOCATE PREPARE inbox_sla_rules_resolution_hours_col_stmt;

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
