-- Permission matrix overrides
CREATE TABLE IF NOT EXISTS permission_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  role VARCHAR(64) NOT NULL,
  permissionKey VARCHAR(128) NOT NULL,
  allowed BOOLEAN NOT NULL,
  updatedBy INT NULL,
  updatedByName VARCHAR(255) NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permission_override_tenant_role_key (tenantId, role, permissionKey),
  KEY idx_permission_override_tenant (tenantId),
  CONSTRAINT fk_permission_overrides_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_permission_overrides_user FOREIGN KEY (updatedBy) REFERENCES users(id)
);

-- CRM auto-lost support
ALTER TABLE crm_leads
  MODIFY COLUMN status ENUM('new','assigned','appointment_set','quoted','contract','building_authority','construction','completed','won','cancelled','lost') NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lostReason VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS lostSource VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS lostCompetitorName VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS lostAutoSetAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS lostPreviousStatus VARCHAR(64) NULL;

-- Shared task metadata
CREATE TABLE IF NOT EXISTS task_tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  name VARCHAR(80) NOT NULL,
  colour VARCHAR(16) NOT NULL DEFAULT '#64748b',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_task_tag_tenant_name (tenantId, name),
  KEY idx_task_tags_tenant (tenantId),
  CONSTRAINT fk_task_tags_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS task_tag_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  tagId INT NOT NULL,
  module ENUM('approvals','construction','manufacturing') NOT NULL,
  taskId INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_task_tag_assignment (tenantId, tagId, module, taskId),
  KEY idx_task_tag_assignments_task (module, taskId),
  CONSTRAINT fk_task_tag_assignments_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id),
  CONSTRAINT fk_task_tag_assignments_tag FOREIGN KEY (tagId) REFERENCES task_tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  module ENUM('approvals','construction','manufacturing') NOT NULL,
  taskId INT NOT NULL,
  body TEXT NOT NULL,
  createdByUserId INT NULL,
  createdByName VARCHAR(255) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_task_comments_task (module, taskId),
  CONSTRAINT fk_task_comments_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id),
  CONSTRAINT fk_task_comments_user FOREIGN KEY (createdByUserId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  module ENUM('approvals','construction','manufacturing') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  priority VARCHAR(32) DEFAULT 'normal',
  assignedToUserId INT NULL,
  assignedToName VARCHAR(255) NULL,
  constructionInstallerId INT NULL,
  approvalProjectId INT NULL,
  constructionJobId INT NULL,
  manufacturingOrderId INT NULL,
  dueOffsetDays INT NOT NULL DEFAULT 0,
  recurrence ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'daily',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  lastCreatedAt TIMESTAMP NULL,
  createdByUserId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task_templates_tenant (tenantId),
  KEY idx_task_templates_active (active),
  CONSTRAINT fk_task_templates_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id),
  CONSTRAINT fk_task_templates_user FOREIGN KEY (createdByUserId) REFERENCES users(id),
  CONSTRAINT fk_task_templates_installer FOREIGN KEY (constructionInstallerId) REFERENCES construction_installers(id)
);

-- Manufacturing PO workflow
ALTER TABLE manufacturing_purchase_orders
  ADD COLUMN IF NOT EXISTS tenantId INT NULL,
  MODIFY COLUMN orderId INT NULL,
  ADD COLUMN IF NOT EXISTS supplierAddress TEXT NULL,
  ADD COLUMN IF NOT EXISTS supplierAbn VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS paymentTermsDays INT NULL DEFAULT 14,
  MODIFY COLUMN status ENUM('draft','issued','confirmed','partially_received','received','paid','cancelled') NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS paidAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS invoiceDueAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS lastSentAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS confirmationToken VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS confirmationStatus ENUM('pending','confirmed','declined') NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS supplierEta TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS supplierConfirmationName VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS supplierConfirmationNotes TEXT NULL,
  ADD COLUMN IF NOT EXISTS confirmedAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS approvalStatus ENUM('not_required','pending','approved','rejected') NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approvalRequiredAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS approvedBy INT NULL,
  ADD COLUMN IF NOT EXISTS approvedByName VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS approvedAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS rejectedBy INT NULL,
  ADD COLUMN IF NOT EXISTS rejectedByName VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS rejectedAt TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS approvalNotes TEXT NULL,
  ADD COLUMN IF NOT EXISTS grnUrl TEXT NULL;

UPDATE manufacturing_purchase_orders mpo
JOIN manufacturing_orders mo ON mo.id = mpo.orderId
JOIN construction_jobs cj ON cj.id = mo.jobId
SET mpo.tenantId = cj.tenantId
WHERE mpo.tenantId IS NULL;

CREATE TABLE IF NOT EXISTS manufacturing_po_audit_trail (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  purchaseOrderId INT NOT NULL,
  action ENUM('create','approve','reject','issue','send','confirm','receive','mark_paid','update','xero_sync') NOT NULL,
  userId INT NULL,
  userName VARCHAR(255) NULL,
  notes TEXT NULL,
  metadata JSON NULL,
  stockMovements JSON NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_manufacturing_po_audit_po (purchaseOrderId),
  KEY idx_manufacturing_po_audit_tenant (tenantId),
  CONSTRAINT fk_manufacturing_po_audit_po FOREIGN KEY (purchaseOrderId) REFERENCES manufacturing_purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_manufacturing_po_audit_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id),
  CONSTRAINT fk_manufacturing_po_audit_user FOREIGN KEY (userId) REFERENCES users(id)
);

ALTER TABLE manufacturing_po_receipts
  ADD COLUMN IF NOT EXISTS tenantId INT NULL,
  ADD COLUMN IF NOT EXISTS product_code VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS ordered_qty DECIMAL(12,4) NULL,
  ADD COLUMN IF NOT EXISTS previously_received_qty DECIMAL(12,4) NULL,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,4) NULL,
  ADD COLUMN IF NOT EXISTS stock_item_id INT NULL,
  ADD COLUMN IF NOT EXISTS inventory_movement_id INT NULL;

ALTER TABLE inventory_movements
  MODIFY COLUMN movement_type ENUM('purchase','purchase_return','allocation','manufacture_use','adjustment_waste','transfer_in','transfer_out') NOT NULL;

CREATE TABLE IF NOT EXISTS manufacturing_po_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  purchaseOrderId INT NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  contentType VARCHAR(128) NULL,
  fileSize INT NULL,
  storageKey TEXT NOT NULL,
  url TEXT NOT NULL,
  attachmentType ENUM('delivery_docket','photo','other') NOT NULL DEFAULT 'other',
  uploadedBy INT NULL,
  uploadedByName VARCHAR(255) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_manufacturing_po_attachments_po (purchaseOrderId),
  KEY idx_manufacturing_po_attachments_tenant (tenantId),
  CONSTRAINT fk_manufacturing_po_attachments_po FOREIGN KEY (purchaseOrderId) REFERENCES manufacturing_purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_manufacturing_po_attachments_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id),
  CONSTRAINT fk_manufacturing_po_attachments_user FOREIGN KEY (uploadedBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS manufacturing_po_returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NULL,
  purchaseOrderId INT NOT NULL,
  poLineItemId INT NULL,
  productCode VARCHAR(128) NULL,
  productName VARCHAR(255) NULL,
  returnQty DECIMAL(12,4) NOT NULL,
  unit VARCHAR(32) NULL,
  unitPrice DECIMAL(12,4) NULL,
  creditAmount DECIMAL(12,2) NULL,
  reason TEXT NULL,
  conditionStatus ENUM('damaged','incorrect_item','over_supply','other') NOT NULL DEFAULT 'other',
  stockItemId INT NULL,
  inventoryMovementId INT NULL,
  returnedBy VARCHAR(255) NULL,
  returnedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_manufacturing_po_returns_po (purchaseOrderId),
  KEY idx_manufacturing_po_returns_tenant (tenantId),
  CONSTRAINT fk_manufacturing_po_returns_po FOREIGN KEY (purchaseOrderId) REFERENCES manufacturing_purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_manufacturing_po_returns_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id)
);

ALTER TABLE manufacturing_po_audit_trail
  MODIFY COLUMN action ENUM('create','approve','reject','issue','send','confirm','receive','return','mark_paid','escalate','update','xero_sync') NOT NULL;
