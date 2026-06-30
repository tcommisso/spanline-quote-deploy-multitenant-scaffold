ALTER TABLE `project_subcontracts`
  ADD COLUMN `clientAccountNumber` varchar(64) NULL AFTER `clientName`;

UPDATE `project_subcontracts` ps
INNER JOIN `construction_jobs` cj
  ON ps.`jobId` = cj.`id`
  AND (ps.`tenantId` <=> cj.`tenantId`)
LEFT JOIN `crm_leads` cl
  ON cj.`leadId` = cl.`id`
SET ps.`clientAccountNumber` = cl.`clientNumber`
WHERE ps.`clientAccountNumber` IS NULL
  AND cl.`clientNumber` IS NOT NULL
  AND cl.`clientNumber` != '';
