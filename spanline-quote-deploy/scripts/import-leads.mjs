import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const CSV_DIR = '/home/ubuntu/upload';

// Australian postcode lookup by suburb+state
const POSTCODE_LOOKUP = {};

async function loadPostcodesFromDB(pool) {
  // Use existing leads that have postcodes as a lookup table
  const [rows] = await pool.execute(
    "SELECT DISTINCT UPPER(suburb) as suburb, state, postcode FROM crm_leads WHERE postcode IS NOT NULL AND postcode != '' AND suburb IS NOT NULL"
  );
  for (const row of rows) {
    const key = `${row.suburb}|${row.state}`;
    POSTCODE_LOOKUP[key] = row.postcode;
  }
  console.log(`Loaded ${Object.keys(POSTCODE_LOOKUP).length} postcode mappings from existing leads`);
}

function lookupPostcode(suburb, state) {
  const key = `${suburb.toUpperCase()}|${state.toUpperCase()}`;
  return POSTCODE_LOOKUP[key] || null;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length < 3) return { designAdvisor: '', leads: [] };
  
  // Line 1: Design Adviser name (may have trailing commas)
  const designAdvisor = lines[0].split(',')[0].trim();
  
  // Line 2: Header row (skip)
  // Lines 3+: Data rows
  const leads = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    // Skip summary rows at the end
    if (line.startsWith('Leads Seen') || line.startsWith('Leads Won') || line.startsWith('Sales Total')) break;
    if (line.replace(/,/g, '').trim() === '') continue;
    
    // Parse CSV properly handling quoted values
    const fields = parseCSVLine(line);
    if (fields.length < 8) continue;
    
    const [leadDate, leadNumber, contact, suburb, state, product, source, outcome, quotedPrice, contractPrice] = fields;
    
    // Skip if no lead number or contact
    if (!leadNumber || !contact) continue;
    
    leads.push({
      leadDate: leadDate.trim(),
      externalLeadNumber: leadNumber.trim(),
      contactLastName: contact.trim(),
      suburb: suburb.trim().toUpperCase(),
      state: state.trim().toUpperCase(),
      productType: product.trim(),
      leadSource: source.trim(),
      outcome: outcome.trim().toLowerCase(),
    });
  }
  
  return { designAdvisor, leads };
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseLeadDate(dateStr) {
  // Format: DD/MM/YYYY or D/M/YYYY
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const d = String(day).padStart(2, '0');
  const m = String(month).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function mapOutcomeToStatus(outcome) {
  switch (outcome) {
    case 'success': return 'completed';
    case 'pending': return 'new';
    case 'cancelled': return 'cancelled';
    case 'deferred': return 'new';
    case 'did not proceed': return 'cancelled';
    case 'lost': return 'cancelled';
    default: return 'new';
  }
}

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL);
  
  await loadPostcodesFromDB(pool);
  
  // Get all CSV files
  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  console.log(`Found ${csvFiles.length} CSV files`);
  
  // Get the next lead number
  const [lastLead] = await pool.execute("SELECT leadNumber FROM crm_leads ORDER BY id DESC LIMIT 1");
  let nextNum = 1;
  if (lastLead.length > 0) {
    const last = lastLead[0].leadNumber;
    nextNum = parseInt(last.replace('L-', ''), 10) + 1;
  }
  console.log(`Next lead number: L-${String(nextNum).padStart(4, '0')}`);
  
  // Get branch IDs
  const [branchRows] = await pool.execute("SELECT id, name FROM branches WHERE isActive = 1");
  const branchMap = {};
  for (const b of branchRows) {
    branchMap[b.name.toLowerCase()] = b.id;
  }
  console.log('Branches:', JSON.stringify(branchMap));
  
  // State to branch mapping
  const stateToBranch = {
    'ACT': branchMap['canberra'] || branchMap['act'] || null,
    'NSW': null, // Could be either Canberra or Wagga depending on suburb
  };
  
  let totalUpdated = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  
  for (const file of csvFiles) {
    const filePath = path.join(CSV_DIR, file);
    const { designAdvisor, leads } = parseCSV(filePath);
    console.log(`\n--- ${file}: DA="${designAdvisor}", ${leads.length} leads ---`);
    
    for (const lead of leads) {
      const leadDateISO = parseLeadDate(lead.leadDate);
      
      // Try to match existing lead by contactLastName + suburb (case-insensitive)
      const [existing] = await pool.execute(
        "SELECT id, leadNumber, designAdvisor, leadSource, outcome, productType, status FROM crm_leads WHERE UPPER(contactLastName) = ? AND UPPER(suburb) = ?",
        [lead.contactLastName.toUpperCase(), lead.suburb.toUpperCase()]
      );
      
      if (existing.length > 0) {
        // Update existing lead with non-monetary fields
        const existingLead = existing[0];
        await pool.execute(
          `UPDATE crm_leads SET 
            designAdvisor = ?,
            leadSource = CASE WHEN leadSource = 'Xero Import' OR leadSource IS NULL THEN ? ELSE leadSource END,
            outcome = CASE WHEN outcome IS NULL THEN ? ELSE outcome END,
            productType = CASE WHEN productType = 'Construction' OR productType IS NULL THEN ? ELSE productType END,
            leadDate = ?,
            externalLeadNumber = ?,
            state = COALESCE(state, ?)
          WHERE id = ?`,
          [
            designAdvisor,
            lead.leadSource || null,
            lead.outcome || null,
            lead.productType || null,
            leadDateISO,
            lead.externalLeadNumber,
            lead.state || null,
            existingLead.id
          ]
        );
        totalUpdated++;
      } else {
        // Insert new lead (without monetary columns)
        const postcode = lookupPostcode(lead.suburb, lead.state);
        const leadNumber = `L-${String(nextNum).padStart(4, '0')}`;
        nextNum++;
        
        const status = mapOutcomeToStatus(lead.outcome);
        
        // Determine branch based on state/suburb
        let branchId = null;
        if (lead.state === 'ACT') {
          branchId = branchMap['canberra'] || null;
        } else if (lead.state === 'NSW') {
          // Check if suburb is in Riverina area (Wagga) or closer to Canberra
          branchId = branchMap['wagga wagga'] || branchMap['riverina'] || null;
        }
        
        await pool.execute(
          `INSERT INTO crm_leads (leadNumber, contactLastName, suburb, state, postcode, productType, leadSource, status, outcome, designAdvisor, leadDate, externalLeadNumber, branchId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            leadNumber,
            lead.contactLastName,
            lead.suburb,
            lead.state,
            postcode,
            lead.productType,
            lead.leadSource,
            status,
            lead.outcome,
            designAdvisor,
            leadDateISO,
            lead.externalLeadNumber,
            branchId
          ]
        );
        totalInserted++;
      }
    }
  }
  
  console.log(`\n=== Import Complete ===`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Total processed: ${totalUpdated + totalInserted + totalSkipped}`);
  
  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
