SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

ALTER TABLE `spec_mappings`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_spec_mappings_tenant` (`tenantId`),
  ADD KEY `idx_spec_mappings_tenant_active` (`tenantId`, `active`);

ALTER TABLE `spec_mapping_history`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_spec_mapping_history_tenant` (`tenantId`),
  ADD KEY `idx_spec_mapping_history_tenant_mapping` (`tenantId`, `mappingId`);

ALTER TABLE `quote_items`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_quote_items_tenant` (`tenantId`),
  ADD KEY `idx_quote_items_tenant_quote` (`tenantId`, `quoteId`);

ALTER TABLE `spec_section_templates`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_spec_section_templates_tenant` (`tenantId`);

UPDATE `quote_items` items
INNER JOIN `quotes` q ON q.`id` = items.`quoteId`
SET items.`tenantId` = q.`tenantId`
WHERE items.`tenantId` IS NULL
  AND q.`tenantId` IS NOT NULL;

UPDATE `spec_mappings`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `spec_mapping_history` history
INNER JOIN `spec_mappings` mappings ON mappings.`id` = history.`mappingId`
SET history.`tenantId` = mappings.`tenantId`
WHERE history.`tenantId` IS NULL
  AND mappings.`tenantId` IS NOT NULL;

UPDATE `spec_mapping_history`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `spec_section_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;
