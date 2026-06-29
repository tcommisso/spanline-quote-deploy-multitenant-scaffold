SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job_shared_files' AND column_name = 'visibleToTradePortal') = 0,
  'ALTER TABLE `job_shared_files` ADD COLUMN `visibleToTradePortal` tinyint DEFAULT 1 AFTER `visible`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job_shared_files' AND column_name = 'visibleToClientPortal') = 0,
  'ALTER TABLE `job_shared_files` ADD COLUMN `visibleToClientPortal` tinyint DEFAULT 0 AFTER `visibleToTradePortal`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job_shared_files' AND column_name = 'clientPortalTitle') = 0,
  'ALTER TABLE `job_shared_files` ADD COLUMN `clientPortalTitle` varchar(255) NULL AFTER `visibleToClientPortal`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job_shared_files' AND column_name = 'clientPortalCategory') = 0,
  'ALTER TABLE `job_shared_files` ADD COLUMN `clientPortalCategory` varchar(64) NULL AFTER `clientPortalTitle`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @portal_photo_comments_document_fk = (
  SELECT constraint_name
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'portal_photo_comments'
    AND column_name = 'documentId'
    AND referenced_table_name = 'portal_documents'
  LIMIT 1
);
SET @migration_sql = IF(
  @portal_photo_comments_document_fk IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `portal_photo_comments` DROP FOREIGN KEY `', @portal_photo_comments_document_fk, '`')
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_photo_comments' AND column_name = 'sharedFileId') = 0,
  'ALTER TABLE `portal_photo_comments` ADD COLUMN `sharedFileId` int NULL AFTER `documentId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_photo_comments' AND column_name = 'documentId' AND is_nullable = 'NO') > 0,
  'ALTER TABLE `portal_photo_comments` MODIFY COLUMN `documentId` int NULL',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'job_shared_files' AND index_name = 'idx_job_shared_files_job_trade') = 0,
  'ALTER TABLE `job_shared_files` ADD INDEX `idx_job_shared_files_job_trade` (`jobId`, `visibleToTradePortal`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'job_shared_files' AND index_name = 'idx_job_shared_files_job_client') = 0,
  'ALTER TABLE `job_shared_files` ADD INDEX `idx_job_shared_files_job_client` (`jobId`, `visibleToClientPortal`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'portal_photo_comments' AND index_name = 'idx_portal_photo_comments_document') = 0,
  'ALTER TABLE `portal_photo_comments` ADD INDEX `idx_portal_photo_comments_document` (`documentId`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'portal_photo_comments' AND index_name = 'idx_portal_photo_comments_shared_file') = 0,
  'ALTER TABLE `portal_photo_comments` ADD INDEX `idx_portal_photo_comments_shared_file` (`sharedFileId`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `job_shared_files`
SET
  `visibleToTradePortal` = COALESCE(`visible`, 1),
  `visibleToClientPortal` = COALESCE(`visibleToClientPortal`, 0);

UPDATE `job_shared_files` jsf
JOIN `portal_documents` pd
  ON jsf.`jobId` = pd.`constructionJobId`
 AND (
      (pd.`fileKey` IS NOT NULL AND pd.`fileKey` <> '' AND jsf.`fileKey` = pd.`fileKey`)
      OR jsf.`fileUrl` = pd.`fileUrl`
    )
SET
  jsf.`visibleToClientPortal` = 1,
  jsf.`clientPortalTitle` = COALESCE(jsf.`clientPortalTitle`, pd.`title`),
  jsf.`clientPortalCategory` = COALESCE(jsf.`clientPortalCategory`, pd.`category`);

INSERT INTO `job_shared_files` (
  `jobId`,
  `fileName`,
  `fileUrl`,
  `fileKey`,
  `fileType`,
  `fileSize`,
  `category`,
  `description`,
  `uploadedBy`,
  `visible`,
  `visibleToTradePortal`,
  `visibleToClientPortal`,
  `clientPortalTitle`,
  `clientPortalCategory`,
  `createdAt`
)
SELECT
  pd.`constructionJobId`,
  pd.`title`,
  pd.`fileUrl`,
  pd.`fileKey`,
  pd.`mimeType`,
  NULL,
  pd.`category`,
  NULL,
  pd.`uploadedBy`,
  0,
  0,
  1,
  pd.`title`,
  pd.`category`,
  pd.`createdAt`
FROM `portal_documents` pd
JOIN (
  SELECT MIN(`id`) AS `id`
  FROM `portal_documents`
  GROUP BY `constructionJobId`, COALESCE(NULLIF(`fileKey`, ''), `fileUrl`)
) first_pd ON first_pd.`id` = pd.`id`
LEFT JOIN `job_shared_files` jsf
  ON jsf.`jobId` = pd.`constructionJobId`
 AND (
      (pd.`fileKey` IS NOT NULL AND pd.`fileKey` <> '' AND jsf.`fileKey` = pd.`fileKey`)
      OR jsf.`fileUrl` = pd.`fileUrl`
    )
WHERE jsf.`id` IS NULL;

UPDATE `portal_photo_comments` ppc
JOIN `portal_documents` pd ON ppc.`documentId` = pd.`id`
JOIN `job_shared_files` jsf
  ON jsf.`jobId` = pd.`constructionJobId`
 AND (
      (pd.`fileKey` IS NOT NULL AND pd.`fileKey` <> '' AND jsf.`fileKey` = pd.`fileKey`)
      OR jsf.`fileUrl` = pd.`fileUrl`
    )
SET ppc.`sharedFileId` = jsf.`id`
WHERE ppc.`sharedFileId` IS NULL;
