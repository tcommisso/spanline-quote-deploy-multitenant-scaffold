SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

ALTER TABLE `text_blocks`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

UPDATE `text_blocks`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

CREATE INDEX `idx_text_blocks_tenant`
  ON `text_blocks` (`tenantId`);

CREATE INDEX `idx_text_blocks_tenant_category`
  ON `text_blocks` (`tenantId`, `category`, `is_active`);
