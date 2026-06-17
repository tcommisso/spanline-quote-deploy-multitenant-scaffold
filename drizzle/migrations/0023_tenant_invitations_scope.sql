CREATE INDEX `idx_invitations_tenant_email_status`
  ON `invitations` (`tenantId`, `email`, `status`);
