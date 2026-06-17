SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

ALTER TABLE `project_plan_templates`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `construction_progress`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `construction_schedule_events`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `construction_kanban_tasks`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `territory_postcodes`
  DROP INDEX `uq_territory_postcode`,
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD UNIQUE KEY `uq_territory_postcode` (`tenantId`, `territory`, `postcode`),
  ADD KEY `idx_territory_postcodes_tenant` (`tenantId`);

ALTER TABLE `ai_prompts`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `ai_knowledge_chunks`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `ai_feedback`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `ai_few_shot_examples`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `ai_corrections`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `manufacturing_supplier_invoices`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `user_locations`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `supplier_feedback`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `induction_form_config`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_induction_form_config_tenant` (`tenantId`);

ALTER TABLE `plan_conversions`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_plan_conversions_tenant` (`tenantId`),
  ADD KEY `idx_plan_conversions_tenant_user` (`tenantId`, `userId`),
  ADD KEY `idx_plan_conversions_tenant_job` (`tenantId`, `jobId`);

ALTER TABLE `approval_workflow_templates`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_approval_workflow_templates_tenant` (`tenantId`),
  ADD KEY `idx_approval_workflow_templates_tenant_pathway` (`tenantId`, `pathwayCode`),
  ADD KEY `idx_approval_workflow_templates_tenant_jurisdiction` (`tenantId`, `jurisdiction`);

ALTER TABLE `project_subcontracts`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_project_subcontracts_tenant` (`tenantId`),
  ADD KEY `idx_project_subcontracts_tenant_job` (`tenantId`, `jobId`),
  ADD KEY `idx_project_subcontracts_tenant_installer` (`tenantId`, `installerId`);

ALTER TABLE `email_images`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_email_images_tenant` (`tenantId`);

ALTER TABLE `product_images`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL,
  ADD KEY `idx_product_images_tenant` (`tenantId`),
  ADD KEY `idx_product_images_tenant_category` (`tenantId`, `category`),
  ADD KEY `idx_product_images_tenant_code` (`tenantId`, `code`);

ALTER TABLE `email_templates`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

SET @email_templates_letter_type_unique := (
  SELECT `INDEX_NAME`
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'email_templates'
    AND `COLUMN_NAME` = 'letterType'
    AND `NON_UNIQUE` = 0
    AND `INDEX_NAME` NOT IN ('PRIMARY', 'uq_email_templates_tenant_letter_type')
  LIMIT 1
);
SET @email_templates_drop_unique_sql := IF(
  @email_templates_letter_type_unique IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `email_templates` DROP INDEX `', @email_templates_letter_type_unique, '`')
);
PREPARE email_templates_drop_unique_stmt FROM @email_templates_drop_unique_sql;
EXECUTE email_templates_drop_unique_stmt;
DEALLOCATE PREPARE email_templates_drop_unique_stmt;

SET @email_templates_tenant_idx_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'email_templates'
    AND `INDEX_NAME` = 'idx_email_templates_tenant'
);
SET @email_templates_add_tenant_idx_sql := IF(
  @email_templates_tenant_idx_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_email_templates_tenant` ON `email_templates` (`tenantId`)'
);
PREPARE email_templates_add_tenant_idx_stmt FROM @email_templates_add_tenant_idx_sql;
EXECUTE email_templates_add_tenant_idx_stmt;
DEALLOCATE PREPARE email_templates_add_tenant_idx_stmt;

SET @email_templates_tenant_letter_type_idx_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'email_templates'
    AND `INDEX_NAME` = 'uq_email_templates_tenant_letter_type'
);
SET @email_templates_add_tenant_letter_type_idx_sql := IF(
  @email_templates_tenant_letter_type_idx_exists > 0,
  'SELECT 1',
  'CREATE UNIQUE INDEX `uq_email_templates_tenant_letter_type` ON `email_templates` (`tenantId`, `letterType`)'
);
PREPARE email_templates_add_tenant_letter_type_idx_stmt FROM @email_templates_add_tenant_letter_type_idx_sql;
EXECUTE email_templates_add_tenant_letter_type_idx_stmt;
DEALLOCATE PREPARE email_templates_add_tenant_letter_type_idx_stmt;

ALTER TABLE `chat_channels`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `chat_channel_members`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `chat_messages`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

UPDATE `construction_progress` progress
INNER JOIN `construction_jobs` jobs ON jobs.`id` = progress.`jobId`
SET progress.`tenantId` = jobs.`tenantId`
WHERE progress.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `construction_schedule_events` events
INNER JOIN `construction_jobs` jobs ON jobs.`id` = events.`jobId`
SET events.`tenantId` = jobs.`tenantId`
WHERE events.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `construction_kanban_tasks` tasks
INNER JOIN `construction_jobs` jobs ON jobs.`id` = tasks.`jobId`
SET tasks.`tenantId` = jobs.`tenantId`
WHERE tasks.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `territory_postcodes` territory
INNER JOIN `branches` branch ON branch.`id` = territory.`branchId`
SET territory.`tenantId` = branch.`tenantId`
WHERE territory.`tenantId` IS NULL
  AND branch.`tenantId` IS NOT NULL;

UPDATE `manufacturing_supplier_invoices` invoices
INNER JOIN `manufacturing_purchase_orders` purchase_orders ON purchase_orders.`id` = invoices.`purchase_order_id`
SET invoices.`tenantId` = purchase_orders.`tenantId`
WHERE invoices.`tenantId` IS NULL
  AND purchase_orders.`tenantId` IS NOT NULL;

UPDATE `user_locations` locations
INNER JOIN `tenant_memberships` memberships ON memberships.`userId` = locations.`user_id`
SET locations.`tenantId` = memberships.`tenantId`
WHERE locations.`tenantId` IS NULL
  AND memberships.`isDefault` = 1
  AND memberships.`tenantId` IS NOT NULL;

UPDATE `supplier_feedback` feedback
INNER JOIN `suppliers` supplier ON supplier.`id` = feedback.`supplierId`
SET feedback.`tenantId` = supplier.`tenantId`
WHERE feedback.`tenantId` IS NULL
  AND supplier.`tenantId` IS NOT NULL;

UPDATE `project_subcontracts` subcontracts
INNER JOIN `construction_jobs` jobs ON jobs.`id` = subcontracts.`jobId`
SET subcontracts.`tenantId` = jobs.`tenantId`
WHERE subcontracts.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `plan_conversions` conversions
INNER JOIN `construction_jobs` jobs ON jobs.`id` = conversions.`jobId`
SET conversions.`tenantId` = jobs.`tenantId`
WHERE conversions.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `chat_channels` channels
INNER JOIN `construction_jobs` jobs ON jobs.`id` = channels.`jobId`
SET channels.`tenantId` = jobs.`tenantId`
WHERE channels.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `chat_channels`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `chat_channel_members` members
INNER JOIN `chat_channels` channels ON channels.`id` = members.`channelId`
SET members.`tenantId` = channels.`tenantId`
WHERE members.`tenantId` IS NULL
  AND channels.`tenantId` IS NOT NULL;

UPDATE `chat_messages` messages
INNER JOIN `chat_channels` channels ON channels.`id` = messages.`channelId`
SET messages.`tenantId` = channels.`tenantId`
WHERE messages.`tenantId` IS NULL
  AND channels.`tenantId` IS NOT NULL;

UPDATE `project_plan_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `branches`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `equipment`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `checklist_items`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `territory_postcodes`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `construction_progress`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `construction_schedule_events`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `construction_kanban_tasks`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ai_prompts`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ai_knowledge_chunks`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ai_feedback`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ai_few_shot_examples`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `ai_corrections`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `manufacturing_supplier_invoices`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `user_locations`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `supplier_feedback`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `induction_form_config`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `plan_conversions`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `approval_workflow_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `project_subcontracts`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `email_images`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `product_images`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `email_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `chat_channel_members`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `chat_messages`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;
