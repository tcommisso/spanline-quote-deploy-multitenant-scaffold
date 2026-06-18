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

SET @project_plan_template_stages_tenant_column_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'project_plan_template_stages'
    AND `COLUMN_NAME` = 'tenantId'
);
SET @project_plan_template_stages_tenant_column_sql := IF(
  @project_plan_template_stages_tenant_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE `project_plan_template_stages` ADD COLUMN `tenantId` int NULL'
);
PREPARE project_plan_template_stages_tenant_column_stmt FROM @project_plan_template_stages_tenant_column_sql;
EXECUTE project_plan_template_stages_tenant_column_stmt;
DEALLOCATE PREPARE project_plan_template_stages_tenant_column_stmt;

SET @project_plan_template_tasks_tenant_column_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'project_plan_template_tasks'
    AND `COLUMN_NAME` = 'tenantId'
);
SET @project_plan_template_tasks_tenant_column_sql := IF(
  @project_plan_template_tasks_tenant_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE `project_plan_template_tasks` ADD COLUMN `tenantId` int NULL'
);
PREPARE project_plan_template_tasks_tenant_column_stmt FROM @project_plan_template_tasks_tenant_column_sql;
EXECUTE project_plan_template_tasks_tenant_column_stmt;
DEALLOCATE PREPARE project_plan_template_tasks_tenant_column_stmt;

SET @equipment_bookings_tenant_column_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'equipment_bookings'
    AND `COLUMN_NAME` = 'tenantId'
);
SET @equipment_bookings_tenant_column_sql := IF(
  @equipment_bookings_tenant_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE `equipment_bookings` ADD COLUMN `tenantId` int NULL'
);
PREPARE equipment_bookings_tenant_column_stmt FROM @equipment_bookings_tenant_column_sql;
EXECUTE equipment_bookings_tenant_column_stmt;
DEALLOCATE PREPARE equipment_bookings_tenant_column_stmt;

SET @idx_project_plan_template_stages_tenant_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'project_plan_template_stages'
    AND `INDEX_NAME` = 'idx_project_plan_template_stages_tenant'
);
SET @idx_project_plan_template_stages_tenant_sql := IF(
  @idx_project_plan_template_stages_tenant_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_project_plan_template_stages_tenant` ON `project_plan_template_stages` (`tenantId`)'
);
PREPARE idx_project_plan_template_stages_tenant_stmt FROM @idx_project_plan_template_stages_tenant_sql;
EXECUTE idx_project_plan_template_stages_tenant_stmt;
DEALLOCATE PREPARE idx_project_plan_template_stages_tenant_stmt;

SET @idx_project_plan_template_stages_tenant_template_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'project_plan_template_stages'
    AND `INDEX_NAME` = 'idx_project_plan_template_stages_tenant_template'
);
SET @idx_project_plan_template_stages_tenant_template_sql := IF(
  @idx_project_plan_template_stages_tenant_template_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_project_plan_template_stages_tenant_template` ON `project_plan_template_stages` (`tenantId`, `templateId`)'
);
PREPARE idx_project_plan_template_stages_tenant_template_stmt FROM @idx_project_plan_template_stages_tenant_template_sql;
EXECUTE idx_project_plan_template_stages_tenant_template_stmt;
DEALLOCATE PREPARE idx_project_plan_template_stages_tenant_template_stmt;

SET @idx_project_plan_template_tasks_tenant_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'project_plan_template_tasks'
    AND `INDEX_NAME` = 'idx_project_plan_template_tasks_tenant'
);
SET @idx_project_plan_template_tasks_tenant_sql := IF(
  @idx_project_plan_template_tasks_tenant_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_project_plan_template_tasks_tenant` ON `project_plan_template_tasks` (`tenantId`)'
);
PREPARE idx_project_plan_template_tasks_tenant_stmt FROM @idx_project_plan_template_tasks_tenant_sql;
EXECUTE idx_project_plan_template_tasks_tenant_stmt;
DEALLOCATE PREPARE idx_project_plan_template_tasks_tenant_stmt;

SET @idx_project_plan_template_tasks_tenant_stage_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'project_plan_template_tasks'
    AND `INDEX_NAME` = 'idx_project_plan_template_tasks_tenant_stage'
);
SET @idx_project_plan_template_tasks_tenant_stage_sql := IF(
  @idx_project_plan_template_tasks_tenant_stage_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_project_plan_template_tasks_tenant_stage` ON `project_plan_template_tasks` (`tenantId`, `stageId`)'
);
PREPARE idx_project_plan_template_tasks_tenant_stage_stmt FROM @idx_project_plan_template_tasks_tenant_stage_sql;
EXECUTE idx_project_plan_template_tasks_tenant_stage_stmt;
DEALLOCATE PREPARE idx_project_plan_template_tasks_tenant_stage_stmt;

SET @idx_equipment_bookings_tenant_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'equipment_bookings'
    AND `INDEX_NAME` = 'idx_equipment_bookings_tenant'
);
SET @idx_equipment_bookings_tenant_sql := IF(
  @idx_equipment_bookings_tenant_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_equipment_bookings_tenant` ON `equipment_bookings` (`tenantId`)'
);
PREPARE idx_equipment_bookings_tenant_stmt FROM @idx_equipment_bookings_tenant_sql;
EXECUTE idx_equipment_bookings_tenant_stmt;
DEALLOCATE PREPARE idx_equipment_bookings_tenant_stmt;

SET @idx_equipment_bookings_tenant_equipment_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'equipment_bookings'
    AND `INDEX_NAME` = 'idx_equipment_bookings_tenant_equipment'
);
SET @idx_equipment_bookings_tenant_equipment_sql := IF(
  @idx_equipment_bookings_tenant_equipment_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_equipment_bookings_tenant_equipment` ON `equipment_bookings` (`tenantId`, `equipmentId`)'
);
PREPARE idx_equipment_bookings_tenant_equipment_stmt FROM @idx_equipment_bookings_tenant_equipment_sql;
EXECUTE idx_equipment_bookings_tenant_equipment_stmt;
DEALLOCATE PREPARE idx_equipment_bookings_tenant_equipment_stmt;

SET @idx_equipment_bookings_tenant_job_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'equipment_bookings'
    AND `INDEX_NAME` = 'idx_equipment_bookings_tenant_job'
);
SET @idx_equipment_bookings_tenant_job_sql := IF(
  @idx_equipment_bookings_tenant_job_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_equipment_bookings_tenant_job` ON `equipment_bookings` (`tenantId`, `jobId`)'
);
PREPARE idx_equipment_bookings_tenant_job_stmt FROM @idx_equipment_bookings_tenant_job_sql;
EXECUTE idx_equipment_bookings_tenant_job_stmt;
DEALLOCATE PREPARE idx_equipment_bookings_tenant_job_stmt;

UPDATE `project_plan_template_stages` stages
INNER JOIN `project_plan_templates` templates
  ON templates.`id` = stages.`templateId`
SET stages.`tenantId` = templates.`tenantId`
WHERE stages.`tenantId` IS NULL
  AND templates.`tenantId` IS NOT NULL;

UPDATE `project_plan_template_stages`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `project_plan_template_tasks` tasks
INNER JOIN `project_plan_template_stages` stages
  ON stages.`id` = tasks.`stageId`
SET tasks.`tenantId` = stages.`tenantId`
WHERE tasks.`tenantId` IS NULL
  AND stages.`tenantId` IS NOT NULL;

UPDATE `project_plan_template_tasks`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `equipment_bookings` bookings
INNER JOIN `equipment` eqp
  ON eqp.`id` = bookings.`equipmentId`
SET bookings.`tenantId` = eqp.`tenantId`
WHERE bookings.`tenantId` IS NULL
  AND eqp.`tenantId` IS NOT NULL;

UPDATE `equipment_bookings` bookings
INNER JOIN `construction_jobs` jobs
  ON jobs.`id` = bookings.`jobId`
SET bookings.`tenantId` = jobs.`tenantId`
WHERE bookings.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `equipment_bookings`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;
