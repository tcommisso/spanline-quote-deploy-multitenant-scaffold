SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

ALTER TABLE `products`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `skylux_matrix`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `colour_groups`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `colour_group_members`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

SET @colour_groups_name_unique := (
  SELECT `INDEX_NAME`
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'colour_groups'
    AND `COLUMN_NAME` = 'name'
    AND `NON_UNIQUE` = 0
    AND `INDEX_NAME` NOT IN ('PRIMARY', 'uq_colour_groups_tenant_name')
  GROUP BY `INDEX_NAME`
  HAVING COUNT(*) = 1
  LIMIT 1
);
SET @colour_groups_drop_unique_sql := IF(
  @colour_groups_name_unique IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `colour_groups` DROP INDEX `', @colour_groups_name_unique, '`')
);
PREPARE colour_groups_drop_unique_stmt FROM @colour_groups_drop_unique_sql;
EXECUTE colour_groups_drop_unique_stmt;
DEALLOCATE PREPARE colour_groups_drop_unique_stmt;

UPDATE `products`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `skylux_matrix`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `colour_groups`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `colour_group_members` members
INNER JOIN `colour_groups` groups ON groups.`id` = members.`colourGroupId`
SET members.`tenantId` = groups.`tenantId`
WHERE members.`tenantId` IS NULL
  AND groups.`tenantId` IS NOT NULL;

UPDATE `colour_group_members`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

CREATE INDEX `idx_products_tenant` ON `products` (`tenantId`);
CREATE INDEX `idx_products_tenant_tab` ON `products` (`tenantId`, `tabName`);
CREATE INDEX `idx_products_tenant_code` ON `products` (`tenantId`, `productCode`);
CREATE INDEX `idx_skylux_matrix_tenant` ON `skylux_matrix` (`tenantId`);
CREATE INDEX `idx_skylux_matrix_tenant_size` ON `skylux_matrix` (`tenantId`, `length`, `width`);
CREATE INDEX `idx_colour_groups_tenant` ON `colour_groups` (`tenantId`);
CREATE UNIQUE INDEX `uq_colour_groups_tenant_name` ON `colour_groups` (`tenantId`, `name`);
CREATE INDEX `idx_colour_group_members_tenant` ON `colour_group_members` (`tenantId`);
CREATE INDEX `idx_colour_group_members_tenant_group` ON `colour_group_members` (`tenantId`, `colourGroupId`);
