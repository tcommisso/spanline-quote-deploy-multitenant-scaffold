SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  ORDER BY `id` ASC
  LIMIT 1
));

ALTER TABLE `inbox_tags`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_inbox_tags_tenant` (`tenantId`),
  ADD KEY `idx_inbox_tags_tenant_active` (`tenantId`, `active`);

ALTER TABLE `email_signatures`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_email_signatures_tenant` (`tenantId`),
  ADD KEY `idx_email_signatures_tenant_user` (`tenantId`, `userId`);

ALTER TABLE `inbox_settings`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_inbox_settings_tenant` (`tenantId`);

SET @inbox_settings_setting_key_unique := (
  SELECT `INDEX_NAME`
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_settings'
    AND `COLUMN_NAME` = 'settingKey'
    AND `NON_UNIQUE` = 0
    AND `INDEX_NAME` NOT IN ('PRIMARY', 'uq_inbox_settings_tenant_key')
  LIMIT 1
);

SET @drop_inbox_settings_unique_sql := IF(
  @inbox_settings_setting_key_unique IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `inbox_settings` DROP INDEX `', @inbox_settings_setting_key_unique, '`')
);

PREPARE drop_inbox_settings_unique_stmt FROM @drop_inbox_settings_unique_sql;
EXECUTE drop_inbox_settings_unique_stmt;
DEALLOCATE PREPARE drop_inbox_settings_unique_stmt;

ALTER TABLE `inbox_sla_rules`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_inbox_sla_rules_tenant` (`tenantId`),
  ADD KEY `idx_inbox_sla_rules_tenant_active` (`tenantId`, `active`);

UPDATE `inbox_tags`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `inbox_settings`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `inbox_sla_rules`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `email_signatures` signatures
INNER JOIN `tenant_memberships` memberships
  ON memberships.`userId` = signatures.`userId`
  AND memberships.`isDefault` = 1
SET signatures.`tenantId` = memberships.`tenantId`
WHERE signatures.`tenantId` IS NULL;

UPDATE `email_signatures`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

CREATE UNIQUE INDEX `uq_inbox_settings_tenant_key`
  ON `inbox_settings` (`tenantId`, `settingKey`);
