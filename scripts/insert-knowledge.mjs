import { getDb } from '../server/db.ts';
import { aiKnowledgeChunks } from '../drizzle/schema.ts';

const chunks = [
  // ─── PRODUCT CATALOGUE OVERVIEW ───
  {
    category: "products",
    title: "Product Catalogue Overview",
    content: `The product catalogue contains 348 active products across 27 categories (tabs): balustrade, consultants, screens, doors, downpipes, glassroom, screenroom, brackets, house, beams, concrete, labour, spanlites, windows, heights, plumbing_and_drainage, poly_carbonate_roof, cleaning, flashings, gables, gutters, roof, ceilings, electrical, flooring, walls, posts. Each product has a product code, name, unit of measure (UOM), base cost, materials cost, install labour cost, consumables cost, markup category, optional fixed sell price, powder coat surcharge, and colour group assignments.`,
    keywords: "products, catalogue, categories, tabs, overview"
  },
  {
    category: "products",
    title: "Product UOM Types",
    content: `Products use various units of measure (UOM): 'm' (linear metre), 'M2' (square metre), 'EA' (each/unit), 'lm' (linear metre). The UOM determines how quantities are calculated during quoting — linear products multiply by length, area products by m², and 'each' items are counted individually.`,
    keywords: "uom, unit of measure, metre, square metre, each, quantity"
  },
  {
    category: "products",
    title: "Balustrade Products",
    content: `Balustrade products include: Aluminium Bifold Doors (ea), 130mm Blade (M2, not available in Cedar or S blade), 38mm Gate 1.000 high x 1.000 wide (EA), 38mm Horizontal Slat with 10mm or 20mm gap (M2), 50mm Horizontal Slat with 10mm or 20mm gap (M2), Aluminium Slat 65mm (M2), Colorbond Horizontal Slat 10mm gap (M2), Glass Balustrade (M2), Glass Balustrade with handrail (M2), Stainless Steel Wire (M2). Balustrade pricing is per square metre or per unit depending on type.`,
    keywords: "balustrade, slat, glass, wire, gate, bifold"
  },
  {
    category: "products",
    title: "Roofing Products",
    content: `Roof products include various sheet types: Climatek V-100, Climatek V-75, Climatek V-125, Climatek V-150 (all measured in linear metres). Roof sheets are mapped via spec mappings that match the specRoofType field condition (e.g., 'contains Climatek v 100') to the correct product and use the roofSheetLM quantity formula. Colour is determined by the specRoofTopColour field.`,
    keywords: "roof, climatek, sheets, roofing, linear metre, spec mapping"
  },
  {
    category: "products",
    title: "Consultant Products",
    content: `Consultant products are priced per unit (ea) and include: Arborist Report, Engineers Report or Surveyors Report (for structures closer than 500mm), Slab Engineering Report, Structural Engineering Report, Survey Report, and Town Planner Report.`,
    keywords: "consultant, engineer, arborist, survey, report"
  },
  // ─── DECK PRODUCTS & PRICING ───
  {
    category: "pricing",
    title: "Deck Product Range",
    content: `The deck product catalogue includes composite decking boards from multiple brands and ranges:
- Compotech Solution: Natural Oak (Grooved, 138mm wide, 23mm thick, 5.4m length, $15.33/lm, $82.80/m² retail, max joist spacing 450mm). Colours: Maple, Smoke, Teak, Ipe, Walnut, Dark Grey.
- KEKSIÄ Evergreen Range: Jamison (Element profile, 140mm wide, 24mm thick, 5.4m, $17.67/lm, $95.00/m² retail). Colours: Pialligo, Jamison, Centurion, Ironbark, Barrington.
- KEKSIÄ Terrace Range: Solid Edge (138mm wide, 25mm thick, 5.4m, $21.47/lm, $110.00/m² retail). Colours: Antique, Teak, Ipe, Silver Grey, Blackbutt.
- KEKSIÄ Coastal Range: Grooved (210mm wide, 23mm thick, 4.88m, $32.12/lm, $120.00/m² retail). Colours: Antique, Aged Wood, Beech, Teak.
All boards have 15% default waste factor and 450mm max joist spacing. Clip fixing cost ranges from $6.60-$7.00/m².`,
    keywords: "deck, decking, composite, board, keksia, compotech, price per metre"
  },
  {
    category: "pricing",
    title: "Deck Pricing Rules",
    content: `Deck pricing rules (Default rule): Default deposit 20%, GST 10%, default margin 45%, minimum margin 30%, stretch margin 50%. Restricted access surcharge: $350. Base delivery fee: $500. Quote validity: 30 days. Manager approval required when margin falls below the minimum threshold.`,
    keywords: "deck, margin, deposit, delivery, surcharge, pricing rules"
  },
  // ─── ECLIPSE (LOUVRE) PRICING ───
  {
    category: "pricing",
    title: "Eclipse Louvre Pricing",
    content: `Eclipse louvre pricing (50 items) covers various blade lengths and finishes:
- Louvre White 2400mm: $139.10
- Louvre Powder Coat 2400mm: $148.60
- Louvre White 2700mm: $156.50
- Louvre Powder Coat 2700mm: $167.20
- Louvre White 3000mm: $173.90
- Louvre Powder Coat 3000mm: $185.80
Pattern: Powder coat adds approximately 7-8% surcharge over white. Longer blades cost more per unit. Pricing is per blade/unit.`,
    keywords: "eclipse, louvre, blade, white, powder coat, pricing"
  },
  // ─── SPEC MAPPINGS ───
  {
    category: "specs",
    title: "Spec Mapping System",
    content: `Spec mappings automatically generate quote components from specsheet selections. Each mapping has: a name, tab category, specField (which specsheet field to check), condition (e.g., 'contains Climatek v 100'), linked productId, quantity formula (e.g., 'roofSheetLM'), colour field reference, and UOM. When a specsheet field matches the condition, the system auto-generates a quote line item with the correct product, quantity, and colour. This ensures consistent and accurate quoting from specifications.`,
    keywords: "spec mapping, auto-generate, quote component, condition, formula"
  },
  // ─── PRICING CALCULATIONS ───
  {
    category: "pricing",
    title: "Travel Allowance Calculation",
    content: `Travel allowance is calculated by determining the road travel distance between the site address and the branch office. This distance is used to look up the applicable band and rate from the pricing settings. The travel allowance is hardwired into the quote financials and can only be overwritten by an admin user.`,
    keywords: "travel, allowance, distance, band, rate, branch"
  },
  {
    category: "pricing",
    title: "Complexity Loading Rules",
    content: `Complexity Loading on Job Financials defaults to 0%. Additional rates are applied based on conditions: Gable roof shape adds the gable rate; Pop-up roof type adds the pop-up rate; Difficult access (from Site Details) adds the access rate; Restricted work times adds the restricted work rate; Mixed materials/angles design adds the mixed materials rate. When multiple conditions apply, all applicable rates are summed together.`,
    keywords: "complexity, loading, gable, pop-up, access, restricted, surcharge"
  },
  {
    category: "pricing",
    title: "Delivery Surcharge Calculation",
    content: `Delivery surcharge is calculated based on the distance between the branch address and site address, applying a per-kilometre rate. This rate is then multiplied by a factor that varies based on the quote's total value, with different factors for different quote value ranges (tiered). These tiers are editable in admin settings.`,
    keywords: "delivery, surcharge, distance, kilometre, tier, quote value"
  },
  {
    category: "pricing",
    title: "Small Job Surcharge",
    content: `A Small Job Surcharge is applied if the quote value falls below a predefined threshold. The surcharge is calculated as a percentage factor of the quote value. Both the threshold and the percentage factor are configurable in pricing settings.`,
    keywords: "small job, surcharge, threshold, minimum, percentage"
  },
  {
    category: "pricing",
    title: "Margin and Markup Structure",
    content: `The quoting system uses a margin-based pricing model. Default margin is 45% for deck quotes. Products can have individual markup categories that override the default. Fixed sell prices bypass margin calculations entirely. The system tracks: base cost (materials + labour + consumables), margin percentage, and final sell price. Manager approval is required when margin drops below the minimum threshold (30% for decks).`,
    keywords: "margin, markup, cost, sell price, approval, threshold"
  },
  // ─── SPECSHEET STRUCTURE ───
  {
    category: "specs",
    title: "Wind Category Options",
    content: `Wind Category dropdown options for spec sheets: N1 (0.44 kPa, non-cyclonic), N2 (0.65 kPa, non-cyclonic), N3 (1.01 kPa, non-cyclonic), N4 (1.5 kPa, non-cyclonic), C1 (1.01 kPa, cyclonic), C2 (1.5 kPa, cyclonic), C3 (2.16 kPa, cyclonic), C4 (2.94 kPa, cyclonic). Each option displays Wind Class, Pressure (kPa), and Group (cyclonic/non-cyclonic).`,
    keywords: "wind, category, pressure, kpa, cyclonic, non-cyclonic, N1, N2, N3, C1"
  },
  {
    category: "specs",
    title: "Frame Type Options",
    content: `Frame type selection is a dropdown with options: Steel, Aluminum, Timber, Pedestal, and Existing Frame (subject to confirmation of suitability). Frame type affects structural calculations and material costs.`,
    keywords: "frame, steel, aluminum, timber, pedestal, existing"
  },
  {
    category: "specs",
    title: "Glass Toning Options",
    content: `Glass toning options are categorised into three sections: Obscurity (Standard/Clear, Translucent, Acid Etched), Tint (Grey, Bronze, Green), and Etched (Satinlite, Cathedral, Spotswood). These options affect both pricing and the visual appearance of glass panels in the design.`,
    keywords: "glass, toning, tint, obscurity, etched, grey, bronze"
  },
  {
    category: "specs",
    title: "Screen Options for Windows and Doors",
    content: `Each window and door added to a specsheet includes a dropdown for screen options: Fly, Pet, Diamond, Security, Invis-gard, or N/A. Screen selection affects both the quote line items and the materials list.`,
    keywords: "screen, fly, pet, diamond, security, invisgard, window, door"
  },
  {
    category: "specs",
    title: "Site Details Section",
    content: `The specsheet includes a 'Site Details' section with checkboxes for: Access difficult, Restricted work times, Site conditions, and Other — plus a notes box. These selections directly impact complexity loading calculations in the financials tab.`,
    keywords: "site details, access, restricted, conditions, complexity"
  },
  {
    category: "specs",
    title: "Concrete Options",
    content: `Default concrete options in the specsheet are: Patio Slab, Enclosure Slab, Topper Slab, and Stamped Concrete. Each type has different cost implications and engineering requirements.`,
    keywords: "concrete, patio, enclosure, topper, stamped, slab"
  },
  // ─── COLOUR SYSTEM ───
  {
    category: "products",
    title: "Colour and Powder Coat System",
    content: `Products can be assigned to colour groups (top and bottom separately). Colour groups contain member colours from the Colorbond palette. A powder coat surcharge applies when non-standard colours are selected. The colour system supports: standard Colorbond colours (no surcharge), powder coat colours (surcharge applies per product), and dual-colour configurations (different top/bottom colours for roofing).`,
    keywords: "colour, color, powder coat, surcharge, colorbond, group"
  },
  // ─── QUOTING WORKFLOW ───
  {
    category: "general",
    title: "Quote to Job Workflow",
    content: `When a quote reaches 'contracted' status in the CRM, the system automatically creates a new construction job. The existing specsheet and quote sections are duplicated into a new 'construction check measure' workbook. A construction user is assigned to review specifications, quantities, and inclusions, generating a variance report, component orders, and trade work orders. The spec sheet PDF and cost report from this process are stamped 'Internal Use Only'.`,
    keywords: "quote, contract, job, construction, check measure, variance"
  },
  {
    category: "general",
    title: "Quote Validity and Deposits",
    content: `Standard quote validity is 30 days. Default deposit percentage is 20% of the total quote value. GST is applied at 10%. These values are configurable per pricing rule set. Promotion codes and discounts can be applied but require manager approval if they push the margin below the minimum threshold.`,
    keywords: "quote, validity, deposit, gst, days, percentage"
  },
  {
    category: "general",
    title: "Xero Integration and Tax Handling",
    content: `The Xero spreadsheet is the source of truth for project financial data. Values from Xero are ex-GST and must be multiplied by 1.1 to store as inc-GST in the database (matching existing conventions). The system matches contacts to project codes and synchronises date created/closed fields. Xero payment reconciliation runs automatically overnight.`,
    keywords: "xero, gst, tax, reconciliation, sync, project code"
  },
];

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB connection'); process.exit(1); }

  console.log(`Inserting ${chunks.length} knowledge chunks...`);
  
  for (const chunk of chunks) {
    await db.insert(aiKnowledgeChunks).values({
      category: chunk.category,
      title: chunk.title,
      content: chunk.content,
      keywords: chunk.keywords,
      active: true,
    });
  }

  console.log(`Done! Inserted ${chunks.length} knowledge chunks.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
