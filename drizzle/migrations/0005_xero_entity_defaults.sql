CREATE TABLE IF NOT EXISTS xero_entity_defaults (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appTenantId INT NOT NULL,
  moduleKey ENUM('global','crm','construction','manufacturing','approvals','trade_portal','portal','scheduled_sync') NOT NULL,
  xeroConnectionId INT NULL,
  updatedBy INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_xero_entity_default_scope (appTenantId, moduleKey),
  KEY idx_xero_entity_defaults_tenant (appTenantId),
  KEY idx_xero_entity_defaults_connection (xeroConnectionId),
  CONSTRAINT fk_xero_entity_defaults_tenant FOREIGN KEY (appTenantId) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_xero_entity_defaults_connection FOREIGN KEY (xeroConnectionId) REFERENCES xero_connections(id) ON DELETE SET NULL,
  CONSTRAINT fk_xero_entity_defaults_user FOREIGN KEY (updatedBy) REFERENCES users(id)
);
