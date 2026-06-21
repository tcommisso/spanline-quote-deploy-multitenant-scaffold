SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `slug` = 'default'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
));

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  ORDER BY `id` ASC
  LIMIT 1
));

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'weather_history' AND column_name = 'tenantId') = 0,
  'ALTER TABLE `weather_history` ADD COLUMN `tenantId` int NULL AFTER `id`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'weather_forecast_cache' AND column_name = 'tenantId') = 0,
  'ALTER TABLE `weather_forecast_cache` ADD COLUMN `tenantId` int NULL AFTER `id`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `branches`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `master_data`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

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

UPDATE `colour_group_members`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `inbox_reply_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `weather_history`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `weather_forecast_cache`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'weather_history' AND index_name = 'idx_weather_history_tenant_location_date') = 0,
  'ALTER TABLE `weather_history` ADD KEY `idx_weather_history_tenant_location_date` (`tenantId`, `locationName`, `date`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'weather_forecast_cache' AND index_name = 'idx_weather_forecast_cache_tenant_location') = 0,
  'ALTER TABLE `weather_forecast_cache` ADD KEY `idx_weather_forecast_cache_tenant_location` (`tenantId`, `locationKey`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'branches' AND index_name = 'idx_branches_tenant_active') = 0,
  'ALTER TABLE `branches` ADD KEY `idx_branches_tenant_active` (`tenantId`, `isActive`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tenant_b_cleanup_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `slug` = 'tenant-b'
     OR `name` = 'Tenant B Test'
  ORDER BY `id` ASC
  LIMIT 1
);

DELETE FROM `branches`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (SELECT `branchId` FROM `manufacturing_schedule` WHERE `branchId` IS NOT NULL)
  AND `id` NOT IN (SELECT `branchId` FROM `manufacturing_tasks` WHERE `branchId` IS NOT NULL)
  AND `id` NOT IN (SELECT `branchId` FROM `territory_postcodes` WHERE `branchId` IS NOT NULL);

DELETE FROM `master_data`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `products`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `skylux_matrix`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `colour_group_members`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `colour_groups`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `inbox_reply_templates`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `ai_prompts`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `inbox_sla_rules`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `sms_templates`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `spec_mappings`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `spec_section_templates`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `blind_pricing_matrix`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `blind_pricing_settings`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `blind_product_options`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `productOptionId`
    FROM `blind_quote_item_options`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `productOptionId` IS NOT NULL
  );

DELETE FROM `blind_fabric_colours`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `fabricColourId`
    FROM `blind_quote_items`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `fabricColourId` IS NOT NULL
  );

DELETE FROM `blind_glass_infill`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `glassInfillId`
    FROM `blind_quote_items`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `glassInfillId` IS NOT NULL
  )
  AND `id` NOT IN (
    SELECT `fabricRangeId`
    FROM `blind_fabric_colours`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `fabricRangeId` IS NOT NULL
  );

DELETE FROM `ss_pricing_matrix`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `ss_pricing_settings`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `ss_price_adjustments`
WHERE `tenantId` = @tenant_b_cleanup_id;

DELETE FROM `ss_product_options`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `productOptionId`
    FROM `ss_quote_item_options`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `productOptionId` IS NOT NULL
  );

DELETE FROM `ss_cost_additions`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `costAdditionId`
    FROM `ss_quote_cost_additions`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `costAdditionId` IS NOT NULL
  );

DELETE FROM `ss_colours`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `colourId`
    FROM `ss_quote_items`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `colourId` IS NOT NULL
  );

DELETE FROM `ss_glass_infill`
WHERE `tenantId` = @tenant_b_cleanup_id
  AND `id` NOT IN (
    SELECT `glassInfillId`
    FROM `ss_quote_items`
    WHERE `tenantId` = @tenant_b_cleanup_id
      AND `glassInfillId` IS NOT NULL
  );
