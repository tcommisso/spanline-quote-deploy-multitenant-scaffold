UPDATE eclipse_quotes
SET tenantId = (SELECT id FROM tenants ORDER BY id LIMIT 1)
WHERE tenantId IS NULL
  AND (SELECT COUNT(*) FROM tenants) = 1;
