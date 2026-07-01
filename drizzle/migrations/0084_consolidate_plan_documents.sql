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
  cp.`jobId`,
  cp.`fileName`,
  cp.`fileUrl`,
  cp.`fileKey`,
  cp.`fileType`,
  NULL,
  'plans',
  cp.`description`,
  cp.`uploadedBy`,
  0,
  0,
  CASE WHEN cp.`status` <> 'draft' THEN 1 ELSE 0 END,
  cp.`title`,
  'plans',
  cp.`createdAt`
FROM `construction_plans` cp
LEFT JOIN `job_shared_files` jsf
  ON jsf.`jobId` = cp.`jobId`
 AND (
      (cp.`fileKey` IS NOT NULL AND cp.`fileKey` <> '' AND jsf.`fileKey` = cp.`fileKey`)
      OR jsf.`fileUrl` = cp.`fileUrl`
    )
WHERE jsf.`id` IS NULL;

UPDATE `job_shared_files` jsf
JOIN `construction_plans` cp
  ON jsf.`jobId` = cp.`jobId`
 AND (
      (cp.`fileKey` IS NOT NULL AND cp.`fileKey` <> '' AND jsf.`fileKey` = cp.`fileKey`)
      OR jsf.`fileUrl` = cp.`fileUrl`
    )
SET
  jsf.`category` = COALESCE(NULLIF(jsf.`category`, ''), 'plans'),
  jsf.`description` = COALESCE(NULLIF(jsf.`description`, ''), cp.`description`),
  jsf.`clientPortalTitle` = COALESCE(NULLIF(jsf.`clientPortalTitle`, ''), cp.`title`),
  jsf.`clientPortalCategory` = COALESCE(NULLIF(jsf.`clientPortalCategory`, ''), 'plans');
