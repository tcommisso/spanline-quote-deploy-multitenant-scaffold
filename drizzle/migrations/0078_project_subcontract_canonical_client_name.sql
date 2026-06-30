UPDATE `project_subcontracts` ps
INNER JOIN `construction_jobs` cj
  ON ps.`jobId` = cj.`id`
  AND (ps.`tenantId` <=> cj.`tenantId`)
INNER JOIN `crm_leads` cl
  ON cj.`leadId` = cl.`id`
  AND (cj.`tenantId` <=> cl.`tenantId`)
SET ps.`clientName` = COALESCE(
  NULLIF(TRIM(CONCAT_WS(' ',
    NULLIF(TRIM(cl.`contactFirstName`), ''),
    NULLIF(TRIM(cl.`contactLastName`), '')
  )), ''),
  NULLIF(TRIM(cl.`company`), '')
)
WHERE ps.`status` = 'draft'
  AND ps.`sentAt` IS NULL
  AND ps.`signedAt` IS NULL
  AND ps.`pdfUrl` IS NULL
  AND ps.`archivedAt` IS NULL
  AND COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ',
      NULLIF(TRIM(cl.`contactFirstName`), ''),
      NULLIF(TRIM(cl.`contactLastName`), '')
    )), ''),
    NULLIF(TRIM(cl.`company`), '')
  ) IS NOT NULL
  AND (
    ps.`clientName` IS NULL
    OR TRIM(ps.`clientName`) = ''
    OR TRIM(ps.`clientName`) = TRIM(cj.`clientName`)
  );
