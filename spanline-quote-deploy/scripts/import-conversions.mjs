import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

// Parse ACT CSV
function parseACTCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // Handle CSV with potential commas in quoted fields
    const row = parseCSVLine(lines[i]);
    if (row.length >= 15) {
      rows.push({
        date: row[0],
        name: row[1],
        email: row[2],
        phone: row[3],
        streetAddress: row[4],
        postcodeField: row[5],
        productEnquiry: row[6],
        message: row[7],
        winLoss: row[8],
        sourceUrl: row[9],
        howHeard: row[10],
        whoReferred: row[11],
        finance: row[12],
        allocatedDA: row[13],
        suburb: row[14],
        postcode: row[15] || ''
      });
    }
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse XLSX using simple approach - read as CSV export
// Actually we'll use a different approach - read the xlsx with openpyxl via python subprocess
async function parseXLSX(filePath) {
  const { execSync } = await import('child_process');
  const tmpCsv = '/tmp/riverina_export.csv';
  execSync(`cd /home/ubuntu && python3 -c "
import openpyxl, csv
wb = openpyxl.load_workbook('${filePath}', read_only=True)
ws = wb.active
with open('${tmpCsv}', 'w', newline='') as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow(row)
wb.close()
"`, { timeout: 120000 });
  
  const content = fs.readFileSync(tmpCsv, 'utf-8');
  const lines = content.split('\n');
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCSVLine(lines[i]);
    if (row.length >= 15) {
      rows.push({
        date: row[0],
        name: row[1],
        email: row[2],
        phone: row[3],
        streetAddress: row[4],
        postcodeField: row[5],
        productEnquiry: row[6],
        message: row[7],
        winLoss: row[8],
        sourceUrl: row[9],
        howHeard: row[10],
        whoReferred: row[11],
        finance: row[12],
        allocatedDA: row[13],
        suburb: row[14],
        postcode: row[15] || ''
      });
    }
  }
  return rows;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  // ACT format: 2022/Oct/1 12:28:08 PM
  const match1 = dateStr.match(/^(\d{4})\/(\w+)\/(\d+)/);
  if (match1) {
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const m = months[match1[2]];
    if (m) return `${match1[1]}-${m}-${match1[3].padStart(2, '0')}`;
  }
  // XLSX format: 2022-10-01 00:00:00 (from python export)
  const match2 = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match2) return match2[1];
  return null;
}

function parseName(fullName) {
  if (!fullName) return { first: '', last: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function extractPostcode(postcodeField, postcode2) {
  // postcodeField might be "2611, WARAMANGA" or just "2611"
  if (postcode2 && postcode2.match(/^\d{4}$/)) return postcode2;
  if (postcodeField) {
    const match = postcodeField.match(/(\d{4})/);
    if (match) return match[1];
  }
  return '';
}

function extractSuburb(row) {
  if (row.suburb && row.suburb.trim()) return row.suburb.trim().toUpperCase();
  // Try to extract from postcodeField like "2611, WARAMANGA"
  if (row.postcodeField) {
    const parts = row.postcodeField.split(',');
    if (parts.length > 1) return parts[1].trim().toUpperCase();
  }
  return '';
}

const CUTOFF = new Date('2022-10-01');

async function main() {
  console.log('Parsing ACT CSV...');
  const actRows = parseACTCSV('/home/ubuntu/upload/ACTSpanlineConversions-Conversions.csv');
  console.log(`ACT CSV: ${actRows.length} total rows`);
  
  console.log('Parsing Riverina XLSX...');
  const rivRows = await parseXLSX('/home/ubuntu/upload/RiverinaSpanlineConversions.xlsx');
  console.log(`Riverina XLSX: ${rivRows.length} total rows`);
  
  // Filter to only rows from 1/10/2022 onwards
  const allRows = [];
  for (const row of [...actRows, ...rivRows]) {
    const dateStr = parseDate(row.date);
    if (!dateStr) continue;
    const dt = new Date(dateStr);
    if (dt >= CUTOFF) {
      allRows.push({ ...row, parsedDate: dateStr, branch: actRows.includes(row) ? 'ACT' : 'Riverina' });
    }
  }
  console.log(`Rows from 1/10/2022 onwards: ${allRows.length}`);
  
  // Connect to DB
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get all existing leads for matching
  const [existingLeads] = await conn.query(`
    SELECT id, contactFirstName, contactLastName, suburb, postcode, 
           contactEmail, contactPhone, contactAddress, leadDate, productType, leadSource
    FROM crm_leads
  `);
  console.log(`Existing leads in DB: ${existingLeads.length}`);
  
  // Build lookup index: lastName_upper + suburb_upper -> lead
  const leadIndex = new Map();
  for (const lead of existingLeads) {
    const lastName = (lead.contactLastName || '').toUpperCase().trim();
    const suburb = (lead.suburb || '').toUpperCase().trim();
    if (lastName && suburb) {
      const key = `${lastName}|${suburb}`;
      if (!leadIndex.has(key)) leadIndex.set(key, []);
      leadIndex.get(key).push(lead);
    }
  }
  
  // Get the max lead number to generate new ones
  const [maxLN] = await conn.query(`SELECT MAX(CAST(SUBSTRING(leadNumber, 4) AS UNSIGNED)) as maxNum FROM crm_leads WHERE leadNumber LIKE 'LN-%'`);
  let nextLeadNum = (maxLN[0].maxNum || 0) + 1;
  
  let updated = 0;
  let inserted = 0;
  let skipped = 0;
  
  for (const row of allRows) {
    const { first, last } = parseName(row.name);
    const suburb = extractSuburb(row);
    const postcode = extractPostcode(row.postcodeField, row.postcode);
    const email = (row.email || '').trim();
    const phone = (row.phone || '').trim();
    const address = (row.streetAddress || '').trim();
    const leadDate = row.parsedDate;
    const productEnquiry = (row.productEnquiry || '').replace(/&amp;/g, '&').trim();
    const sourceUrl = (row.sourceUrl || '').trim();
    
    if (!last && !first) { skipped++; continue; }
    
    // Try to match by last name + suburb
    const lastUpper = last.toUpperCase();
    const suburbUpper = suburb.toUpperCase();
    const key = `${lastUpper}|${suburbUpper}`;
    const matches = leadIndex.get(key) || [];
    
    if (matches.length > 0) {
      // Update the first match with missing info
      const lead = matches[0];
      const updates = [];
      const values = [];
      
      if (email && (!lead.contactEmail || lead.contactEmail === '')) {
        updates.push('contactEmail = ?');
        values.push(email);
      }
      if (phone && (!lead.contactPhone || lead.contactPhone === '')) {
        updates.push('contactPhone = ?');
        values.push(phone);
      }
      if (address && (!lead.contactAddress || lead.contactAddress === '')) {
        updates.push('contactAddress = ?');
        values.push(address);
      }
      if (leadDate && !lead.leadDate) {
        updates.push('leadDate = ?');
        values.push(leadDate);
      }
      if (productEnquiry && (!lead.productType || lead.productType === '')) {
        updates.push('productType = ?');
        values.push(productEnquiry.substring(0, 255));
      }
      if (sourceUrl && (!lead.leadSource || lead.leadSource === '')) {
        updates.push('leadSource = ?');
        values.push('Website');
      }
      
      if (updates.length > 0) {
        values.push(lead.id);
        await conn.query(`UPDATE crm_leads SET ${updates.join(', ')} WHERE id = ?`, values);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Insert as new lead
      const branchId = row.branch === 'ACT' ? 1 : 2; // Assuming 1=Canberra/ACT, 2=Riverina
      const leadNumber = `LN-${String(nextLeadNum++).padStart(5, '0')}`;
      await conn.query(`
        INSERT INTO crm_leads (leadNumber, contactFirstName, contactLastName, contactEmail, contactPhone, contactAddress, 
                               suburb, postcode, productType, leadSource, leadDate, status, outcome, branchId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', '', ?, NOW(), NOW())
      `, [
        leadNumber, first, last, email || null, phone || null, address || null,
        suburb, postcode, productEnquiry.substring(0, 100) || null, 
        sourceUrl ? 'Website' : null, leadDate, branchId
      ]);
      inserted++;
    }
  }
  
  console.log(`\n=== Import Complete ===`);
  console.log(`Updated: ${updated} existing leads with new contact info`);
  console.log(`Inserted: ${inserted} new leads`);
  console.log(`Skipped: ${skipped} (no updates needed or no name)`);
  
  await conn.end();
}

main().catch(console.error);
