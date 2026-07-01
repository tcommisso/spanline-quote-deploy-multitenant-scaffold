CREATE TABLE IF NOT EXISTS marketing_contact_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NOT NULL,
  channel ENUM('email', 'sms') NOT NULL,
  contactValue VARCHAR(320) NOT NULL,
  unsubscribeToken VARCHAR(96) NOT NULL,
  leadId INT NULL,
  source VARCHAR(64),
  unsubscribedAt TIMESTAMP NULL,
  unsubscribeReason VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_marketing_pref_tenant
    FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_marketing_pref_lead
    FOREIGN KEY (leadId) REFERENCES crm_leads(id) ON DELETE SET NULL,
  UNIQUE KEY uq_marketing_pref_contact (tenantId, channel, contactValue),
  UNIQUE KEY uq_marketing_pref_token (unsubscribeToken),
  KEY idx_marketing_pref_tenant_channel (tenantId, channel),
  KEY idx_marketing_pref_tenant_lead (tenantId, leadId)
);
