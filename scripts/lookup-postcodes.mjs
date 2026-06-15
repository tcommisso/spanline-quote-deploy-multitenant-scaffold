import mysql from 'mysql2/promise';
import fs from 'fs';

// Load Australian postcode data
function loadPostcodeCSV() {
  const content = fs.readFileSync('/home/ubuntu/au_postcodes.csv', 'utf-8');
  const lines = content.split('\n');
  const lookup = {};
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 4) continue;
    const postcode = parts[0].trim();
    const placeName = parts[1].trim().toUpperCase();
    const stateCode = parts[3].trim().toUpperCase();
    
    const key = `${placeName}|${stateCode}`;
    if (!lookup[key]) {
      lookup[key] = postcode;
    }
  }
  return lookup;
}

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const lookup = loadPostcodeCSV();
  console.log(`Loaded ${Object.keys(lookup).length} postcode entries`);
  
  // Get all leads missing postcodes
  const [leads] = await pool.execute(
    "SELECT id, UPPER(suburb) as suburb, UPPER(state) as state FROM crm_leads WHERE (postcode IS NULL OR postcode = '') AND suburb IS NOT NULL AND suburb != ''"
  );
  console.log(`Found ${leads.length} leads needing postcodes`);
  
  let updated = 0;
  let notFound = 0;
  const notFoundSuburbs = new Set();
  
  for (const lead of leads) {
    const key = `${lead.suburb}|${lead.state}`;
    const postcode = lookup[key];
    
    if (postcode) {
      await pool.execute("UPDATE crm_leads SET postcode = ? WHERE id = ?", [postcode, lead.id]);
      updated++;
    } else {
      notFound++;
      notFoundSuburbs.add(`${lead.suburb}, ${lead.state}`);
    }
  }
  
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  if (notFoundSuburbs.size > 0) {
    console.log(`Suburbs not found (${notFoundSuburbs.size}):`);
    for (const s of notFoundSuburbs) {
      console.log(`  - ${s}`);
    }
  }
  
  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Postcode lookup failed:', err);
  process.exit(1);
});
