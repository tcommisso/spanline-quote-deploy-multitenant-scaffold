CREATE TABLE IF NOT EXISTS manufacturing_transition_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NOT NULL,
  importNumber VARCHAR(64) NOT NULL,
  sourceFileName VARCHAR(255) NOT NULL,
  worksheetName VARCHAR(255),
  clientName VARCHAR(255),
  siteAddress TEXT,
  status ENUM('imported', 'in_review', 'accepted', 'cancelled', 'archived') NOT NULL DEFAULT 'imported',
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  lineCount INT NOT NULL DEFAULT 0,
  matchedLineCount INT NOT NULL DEFAULT 0,
  notes TEXT,
  createdBy INT,
  createdByName VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_manufacturing_transition_import_tenant
    FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_manufacturing_transition_import_user
    FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_manufacturing_transition_import_number (tenantId, importNumber),
  KEY idx_manufacturing_transition_import_tenant_status (tenantId, status),
  KEY idx_manufacturing_transition_import_tenant_updated (tenantId, updatedAt)
);

CREATE TABLE IF NOT EXISTS manufacturing_product_match_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NOT NULL,
  rawProductKey VARCHAR(255) NOT NULL,
  rawProductName VARCHAR(255) NOT NULL,
  stockItemId INT,
  stockItemCode VARCHAR(50),
  stockItemName VARCHAR(255),
  timesUsed INT NOT NULL DEFAULT 0,
  confidence DECIMAL(5,2) DEFAULT 100.00,
  lastUsedAt TIMESTAMP NULL,
  createdBy INT,
  createdByName VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_manufacturing_product_match_tenant
    FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_manufacturing_product_match_user
    FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_manufacturing_product_match_key (tenantId, rawProductKey),
  KEY idx_manufacturing_product_match_stock (tenantId, stockItemId)
);

CREATE TABLE IF NOT EXISTS manufacturing_transition_import_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenantId INT NOT NULL,
  importId INT NOT NULL,
  rowNumber INT NOT NULL,
  rawProductKey VARCHAR(255),
  rawProductCode VARCHAR(128),
  rawProductName VARCHAR(255) NOT NULL,
  rawDescription TEXT,
  rawCategory VARCHAR(128),
  rawColour VARCHAR(128),
  rawUnit VARCHAR(32),
  quantity DECIMAL(12,4) DEFAULT 1.0000,
  length DECIMAL(12,2),
  width DECIMAL(12,2),
  stockItemId INT,
  stockItemCode VARCHAR(50),
  stockItemName VARCHAR(255),
  matchStatus ENUM('learned', 'fuzzy', 'manual', 'unmatched') NOT NULL DEFAULT 'unmatched',
  matchConfidence DECIMAL(5,2) DEFAULT 0.00,
  sourceType ENUM('manufacture', 'procure') NOT NULL DEFAULT 'manufacture',
  rawData JSON DEFAULT (JSON_OBJECT()),
  notes TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_manufacturing_transition_row_tenant
    FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_manufacturing_transition_row_import
    FOREIGN KEY (importId) REFERENCES manufacturing_transition_imports(id) ON DELETE CASCADE,
  KEY idx_manufacturing_transition_rows_import (importId),
  KEY idx_manufacturing_transition_rows_tenant_status (tenantId, matchStatus)
);
