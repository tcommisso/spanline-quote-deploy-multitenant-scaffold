SET @inbox_tickets_channel_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'channel'
);
SET @inbox_tickets_channel_col_sql := IF(
  @inbox_tickets_channel_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `channel` enum(''email'',''phone'',''web'',''portal'',''manual'') NOT NULL DEFAULT ''email'' AFTER `receivedByAddress`'
);
PREPARE inbox_tickets_channel_col_stmt FROM @inbox_tickets_channel_col_sql;
EXECUTE inbox_tickets_channel_col_stmt;
DEALLOCATE PREPARE inbox_tickets_channel_col_stmt;

SET @inbox_tickets_priority_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'priority'
);
SET @inbox_tickets_priority_col_sql := IF(
  @inbox_tickets_priority_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `priority` enum(''low'',''normal'',''high'',''urgent'') NOT NULL DEFAULT ''normal'' AFTER `channel`'
);
PREPARE inbox_tickets_priority_col_stmt FROM @inbox_tickets_priority_col_sql;
EXECUTE inbox_tickets_priority_col_stmt;
DEALLOCATE PREPARE inbox_tickets_priority_col_stmt;

SET @inbox_tickets_status_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'status'
);
SET @inbox_tickets_status_col_sql := IF(
  @inbox_tickets_status_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `status` enum(''new'',''open'',''waiting_customer'',''customer_replied'',''closed'',''spam'') NOT NULL DEFAULT ''new'' AFTER `priority`'
);
PREPARE inbox_tickets_status_col_stmt FROM @inbox_tickets_status_col_sql;
EXECUTE inbox_tickets_status_col_stmt;
DEALLOCATE PREPARE inbox_tickets_status_col_stmt;

SET @inbox_tickets_latest_direction_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'latestDirection'
);
SET @inbox_tickets_latest_direction_col_sql := IF(
  @inbox_tickets_latest_direction_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inbox_tickets` ADD COLUMN `latestDirection` enum(''inbound'',''outbound'') NULL AFTER `messageCount`'
);
PREPARE inbox_tickets_latest_direction_col_stmt FROM @inbox_tickets_latest_direction_col_sql;
EXECUTE inbox_tickets_latest_direction_col_stmt;
DEALLOCATE PREPARE inbox_tickets_latest_direction_col_stmt;

SET @inbox_tickets_legacy_channel_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'inboxTicketChannel'
);
SET @inbox_tickets_legacy_channel_sql := IF(
  @inbox_tickets_legacy_channel_col_exists > 0,
  'UPDATE `inbox_tickets` SET `channel` = `inboxTicketChannel` WHERE `inboxTicketChannel` IS NOT NULL',
  'SELECT 1'
);
PREPARE inbox_tickets_legacy_channel_stmt FROM @inbox_tickets_legacy_channel_sql;
EXECUTE inbox_tickets_legacy_channel_stmt;
DEALLOCATE PREPARE inbox_tickets_legacy_channel_stmt;

SET @inbox_tickets_legacy_priority_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'inboxTicketPriority'
);
SET @inbox_tickets_legacy_priority_sql := IF(
  @inbox_tickets_legacy_priority_col_exists > 0,
  'UPDATE `inbox_tickets` SET `priority` = `inboxTicketPriority` WHERE `inboxTicketPriority` IS NOT NULL',
  'SELECT 1'
);
PREPARE inbox_tickets_legacy_priority_stmt FROM @inbox_tickets_legacy_priority_sql;
EXECUTE inbox_tickets_legacy_priority_stmt;
DEALLOCATE PREPARE inbox_tickets_legacy_priority_stmt;

SET @inbox_tickets_legacy_status_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'inboxTicketStatus'
);
SET @inbox_tickets_legacy_status_sql := IF(
  @inbox_tickets_legacy_status_col_exists > 0,
  'UPDATE `inbox_tickets` SET `status` = `inboxTicketStatus` WHERE `inboxTicketStatus` IS NOT NULL',
  'SELECT 1'
);
PREPARE inbox_tickets_legacy_status_stmt FROM @inbox_tickets_legacy_status_sql;
EXECUTE inbox_tickets_legacy_status_stmt;
DEALLOCATE PREPARE inbox_tickets_legacy_status_stmt;

SET @inbox_tickets_legacy_latest_direction_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_tickets'
    AND `COLUMN_NAME` = 'inboxTicketLatestDirection'
);
SET @inbox_tickets_legacy_latest_direction_sql := IF(
  @inbox_tickets_legacy_latest_direction_col_exists > 0,
  'UPDATE `inbox_tickets` SET `latestDirection` = `inboxTicketLatestDirection` WHERE `inboxTicketLatestDirection` IS NOT NULL',
  'SELECT 1'
);
PREPARE inbox_tickets_legacy_latest_direction_stmt FROM @inbox_tickets_legacy_latest_direction_sql;
EXECUTE inbox_tickets_legacy_latest_direction_stmt;
DEALLOCATE PREPARE inbox_tickets_legacy_latest_direction_stmt;
