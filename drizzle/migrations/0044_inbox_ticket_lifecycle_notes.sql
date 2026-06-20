SET @inbox_tickets_status_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'status'
);
SET @inbox_tickets_status_col_sql := IF(
  @inbox_tickets_status_col_exists > 0,
  'ALTER TABLE `inbox_tickets` MODIFY COLUMN `status` enum(''new'',''open'',''waiting_customer'',''waiting_internal'',''customer_replied'',''resolved'',''closed'',''spam'') NOT NULL DEFAULT ''new''',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `status` enum(''new'',''open'',''waiting_customer'',''waiting_internal'',''customer_replied'',''resolved'',''closed'',''spam'') NOT NULL DEFAULT ''new'''
);
PREPARE inbox_tickets_status_col_stmt FROM @inbox_tickets_status_col_sql;
EXECUTE inbox_tickets_status_col_stmt;
DEALLOCATE PREPARE inbox_tickets_status_col_stmt;

SET @inbox_tickets_queue_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'queue'
);
SET @inbox_tickets_queue_col_sql := IF(
  @inbox_tickets_queue_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `queue` varchar(50) NULL AFTER `receivedByAddress`'
);
PREPARE inbox_tickets_queue_col_stmt FROM @inbox_tickets_queue_col_sql;
EXECUTE inbox_tickets_queue_col_stmt;
DEALLOCATE PREPARE inbox_tickets_queue_col_stmt;

SET @inbox_tickets_waiting_on_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'waitingOn'
);
SET @inbox_tickets_waiting_on_col_sql := IF(
  @inbox_tickets_waiting_on_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `waitingOn` enum(''customer'',''internal'',''staff'',''none'') NOT NULL DEFAULT ''staff'' AFTER `status`'
);
PREPARE inbox_tickets_waiting_on_col_stmt FROM @inbox_tickets_waiting_on_col_sql;
EXECUTE inbox_tickets_waiting_on_col_stmt;
DEALLOCATE PREPARE inbox_tickets_waiting_on_col_stmt;

SET @inbox_tickets_last_responder_name_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'lastResponderName'
);
SET @inbox_tickets_last_responder_name_col_sql := IF(
  @inbox_tickets_last_responder_name_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `lastResponderName` varchar(255) NULL AFTER `assignedAt`'
);
PREPARE inbox_tickets_last_responder_name_col_stmt FROM @inbox_tickets_last_responder_name_col_sql;
EXECUTE inbox_tickets_last_responder_name_col_stmt;
DEALLOCATE PREPARE inbox_tickets_last_responder_name_col_stmt;

SET @inbox_tickets_last_responder_email_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'lastResponderEmail'
);
SET @inbox_tickets_last_responder_email_col_sql := IF(
  @inbox_tickets_last_responder_email_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `lastResponderEmail` varchar(320) NULL AFTER `lastResponderName`'
);
PREPARE inbox_tickets_last_responder_email_col_stmt FROM @inbox_tickets_last_responder_email_col_sql;
EXECUTE inbox_tickets_last_responder_email_col_stmt;
DEALLOCATE PREPARE inbox_tickets_last_responder_email_col_stmt;

CREATE TABLE IF NOT EXISTS `inbox_ticket_notes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NULL,
  `ticketId` int NOT NULL,
  `body` text NOT NULL,
  `createdBy` int NULL,
  `createdByName` varchar(100) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_inbox_ticket_notes_tenant_ticket` (`tenantId`, `ticketId`),
  KEY `idx_inbox_ticket_notes_ticket` (`ticketId`)
);
