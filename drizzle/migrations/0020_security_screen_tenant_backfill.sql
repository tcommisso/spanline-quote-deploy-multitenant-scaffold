SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

UPDATE `ss_pricing_settings`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_pricing_matrix`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_price_adjustments`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_cost_additions`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_product_options`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_glass_infill`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_colours`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_quotes`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ss_quote_items` items
INNER JOIN `ss_quotes` quotes ON quotes.`id` = items.`quoteId`
SET items.`tenantId` = quotes.`tenantId`
WHERE items.`tenantId` IS NULL
  AND quotes.`tenantId` IS NOT NULL;

UPDATE `ss_quote_item_options` options
INNER JOIN `ss_quote_items` items ON items.`id` = options.`quoteItemId`
SET options.`tenantId` = items.`tenantId`
WHERE options.`tenantId` IS NULL
  AND items.`tenantId` IS NOT NULL;

UPDATE `ss_quote_cost_additions` costs
INNER JOIN `ss_quotes` quotes ON quotes.`id` = costs.`quoteId`
SET costs.`tenantId` = quotes.`tenantId`
WHERE costs.`tenantId` IS NULL
  AND quotes.`tenantId` IS NOT NULL;
