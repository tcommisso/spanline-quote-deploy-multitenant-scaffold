/**
 * Subcontract PDF Generation
 * Generates a PDF from the project subcontract data that matches the original template layout
 */

interface SubcontractPdfData {
  companyName: string;
  jobNumber: string;
  clientName: string;
  clientAccountNumber: string;
  constructionManager: string;
  subcontractorName: string;
  subcontractorPhone: string;
  siteAddress: string;
  subcontractSum: string;
  paymentSchedule: Array<{
    label: string;
    amountDollars: number | null;
    percentOfTotal: number | null;
    usePercent: boolean;
  }>;
  estimatedCommencement: string | null;
  estimatedCompletion: string | null;
  buildingFile: { plans: string; materialsList: string; approvals: string };
  inspections: { footings: string; slab: string; plumbing: string; framing: string; roofing: string; other: string };
  otherContractors: { electrician: string; plumber: string; concreter: string; flooring: string; painter: string };
  electricalCabling: { wall: string; roof: string; fan: string };
  downpipes: { toGround: string; toSpreader: string; toExistingDP: string; toStormwater: string };
  flashingBySubcontractor: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

function fmtDollars(v: number | null): string {
  if (v === null || v === undefined) return "$0.00";
  return "$" + v.toFixed(2);
}

function fmtPercent(v: number | null): string {
  if (v === null || v === undefined) return "0.00%";
  return v.toFixed(2) + "%";
}

/**
 * Generate HTML for the subcontract that can be rendered to PDF
 */
export function generateSubcontractHtml(data: SubcontractPdfData): string {
  const companyName = escapeHtml(data.companyName || "Commisso Group Pty Limited");
  const totalDollars = data.paymentSchedule
    .filter((m) => !m.usePercent)
    .reduce((sum, m) => sum + (m.amountDollars || 0), 0);
  const totalPercent = data.paymentSchedule
    .filter((m) => m.usePercent)
    .reduce((sum, m) => sum + (m.percentOfTotal || 0), 0);

  const milestoneRows = data.paymentSchedule
    .map(
      (m) => `
      <tr>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;">${m.label}</td>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;text-align:right;">${m.usePercent ? "" : fmtDollars(m.amountDollars)}</td>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;text-align:center;">${m.usePercent ? "Select" : "or"}</td>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;text-align:right;">${m.usePercent ? fmtPercent(m.percentOfTotal) : ""}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 15mm; color: #000; font-size: 11px; line-height: 1.4; width: 210mm; min-height: 297mm; }
    h1 { font-size: 18px; margin-bottom: 8px; font-weight: bold; }
    .field-row { margin: 5px 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .field-pair { display: flex; align-items: baseline; gap: 6px; }
    .field-label { font-weight: bold; font-size: 10px; white-space: nowrap; }
    .field-value { border-bottom: 1px solid #000; min-width: 140px; padding: 1px 4px; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; margin: 6px 0; }
    th { background: #f0f0f0; border: 1px solid #000; padding: 3px 6px; font-size: 10px; text-align: left; }
    td { border: 1px solid #000; padding: 3px 6px; font-size: 10px; }
    .checklist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
    .checklist-table { width: 100%; }
    .checklist-table td { border: 1px solid #000; padding: 2px 6px; font-size: 10px; }
    .checklist-table th { border: 1px solid #000; padding: 2px 6px; font-size: 10px; background: #f0f0f0; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .sig-block { border: 1px solid #000; padding: 10px; }
    .sig-line { border-bottom: 1px solid #000; height: 20px; margin: 3px 0; }
    .terms { color: red; font-weight: bold; margin: 12px 0 4px; font-size: 11px; }
    .terms-text { font-size: 9px; line-height: 1.5; }
    .header-bar { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 12px; }
    .intro-text { font-size: 10px; margin-bottom: 10px; line-height: 1.5; }
    @media print { body { padding: 0; width: auto; min-height: auto; } }
    @media screen { body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); } }
  </style>
</head>
<body>
  <div class="header-bar">
    <h1>Project Subcontract</h1>
    <p style="font-size:9px;color:#555;">${companyName}</p>
  </div>
  
  <p class="intro-text">The information identified in this document forms a specific separate Project Subcontract between ${companyName} and the Subcontractor.</p>
  <p class="intro-text">The Project Subcontract incorporates by reference the general conditions of the latest current version of the Master Subcontract that has been agreed between ${companyName} and the Subcontractor.</p>

  <div style="margin-top:12px;">
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Job No.:</span><span class="field-value">${data.jobNumber}</span></span>
      <span class="field-pair"><span class="field-label">Client Name:</span><span class="field-value">${data.clientName}</span></span>
    </div>
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Client Account Number:</span><span class="field-value" style="min-width:180px;">${data.clientAccountNumber}</span></span>
    </div>
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Construction Manager:</span><span class="field-value" style="min-width:280px;">${data.constructionManager}</span></span>
    </div>
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Subcontractor:</span><span class="field-value" style="min-width:280px;">${data.subcontractorName}</span></span>
    </div>
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Phone:</span><span class="field-value" style="min-width:280px;">${data.subcontractorPhone}</span></span>
    </div>
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Site Address:</span><span class="field-value" style="min-width:280px;">${data.siteAddress}</span></span>
    </div>
  </div>

  <div class="field-row" style="margin-top:12px;">
    <span class="field-pair"><span class="field-label">Project Subcontract Sum <em>(ex GST)</em>:</span><span class="field-value">$ ${data.subcontractSum}</span></span>
  </div>

  <p style="font-weight:bold;margin-top:12px;font-size:11px;">Payment Schedule:</p>
  <table>
    <thead>
      <tr>
        <th style="width:40%;">Milestone</th>
        <th style="width:20%;text-align:right;">$ Amount</th>
        <th style="width:10%;text-align:center;">or</th>
        <th style="width:20%;text-align:right;">% of Total</th>
      </tr>
    </thead>
    <tbody>
      ${milestoneRows}
      <tr style="font-weight:bold;">
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;">Total</td>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;text-align:right;">${fmtDollars(totalDollars)}</td>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;"></td>
        <td style="border:1px solid #000;padding:4px 8px;font-size:11px;text-align:right;">${fmtPercent(totalPercent)}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top:10px;">
    <div class="field-row">
      <span class="field-pair"><span class="field-label">Date for Estimated Commencement:</span><span class="field-value">${fmtDate(data.estimatedCommencement)}</span></span>
      <span class="field-pair"><span class="field-label">Date for Completion:</span><span class="field-value">${fmtDate(data.estimatedCompletion)}</span></span>
    </div>
  </div>

  <p class="terms">The documents marked or identified below form part of this Project Subcontract:</p>

  <div class="checklist-grid">
    <table class="checklist-table">
      <tr><th colspan="2">Building File including:</th></tr>
      <tr><td>Plans</td><td>${data.buildingFile.plans}</td></tr>
      <tr><td>Materials list</td><td>${data.buildingFile.materialsList}</td></tr>
      <tr><td>Approvals</td><td>${data.buildingFile.approvals}</td></tr>
      <tr><th colspan="2">Inspection requirements:</th></tr>
      <tr><td>Footings</td><td>${data.inspections.footings}</td></tr>
      <tr><td>Slab</td><td>${data.inspections.slab}</td></tr>
      <tr><td>Plumbing</td><td>${data.inspections.plumbing}</td></tr>
      <tr><td>Framing</td><td>${data.inspections.framing}</td></tr>
      <tr><td>Roofing</td><td>${data.inspections.roofing}</td></tr>
      <tr><td>Other (Specify)</td><td>${data.inspections.other}</td></tr>
    </table>

    <table class="checklist-table">
      <tr><th colspan="2">Other Contractors accessing site:</th></tr>
      <tr><td>Electrician</td><td>${data.otherContractors.electrician}</td></tr>
      <tr><td>Plumber</td><td>${data.otherContractors.plumber}</td></tr>
      <tr><td>Concreter</td><td>${data.otherContractors.concreter}</td></tr>
      <tr><td>Flooring</td><td>${data.otherContractors.flooring}</td></tr>
      <tr><td>Painter</td><td>${data.otherContractors.painter}</td></tr>
      <tr><th colspan="2">Electrical Cabling by Installer:</th></tr>
      <tr><td>Wall</td><td>${data.electricalCabling.wall}</td></tr>
      <tr><td>Roof</td><td>${data.electricalCabling.roof}</td></tr>
      <tr><td>Fan</td><td>${data.electricalCabling.fan}</td></tr>
      <tr><th colspan="2">Downpipes:</th></tr>
      <tr><td>Downpipe to ground</td><td>${data.downpipes.toGround}</td></tr>
      <tr><td>Downpipe to spreader</td><td>${data.downpipes.toSpreader}</td></tr>
      <tr><td>Downpipe to existing DP</td><td>${data.downpipes.toExistingDP}</td></tr>
      <tr><td>Downpipe to Stormwater</td><td>${data.downpipes.toStormwater}</td></tr>
    </table>
  </div>

  <div class="field-row" style="margin-top:10px;">
    <span class="field-pair"><span class="field-label">Flashing measurement and design by Subcontractor:</span><span class="field-value">${data.flashingBySubcontractor}</span></span>
  </div>

  <p class="terms-text" style="margin-top:12px;">
    By working on the site listed you agree to the Build fee issued by ${companyName} and will conduct work that is to the highest
    standard and working inline with all WHS requirements, the site will be keep clean and free of mess by the contractor
    while works are being carried out, any damage to materials caused by the contractor can be back charged to the
    contractor at the discretion of ${companyName}, a retention is kept for 15 days after the works have been completed by the contractor,
    during this time any rectification will need to be completed before this 15 days has ended.
  </p>

  <div class="sig-grid">
    <div class="sig-block">
      <p style="font-size:9px;font-weight:bold;text-align:center;margin-bottom:10px;">
        Executed by Authorised Signatory for and on behalf of the Subcontractor:
      </p>
      <p style="font-size:10px;">Signature:</p><div class="sig-line"></div>
      <p style="font-size:10px;">Name:</p><div class="sig-line"></div>
      <p style="font-size:10px;">Date:</p><div class="sig-line"></div>
    </div>
    <div class="sig-block">
      <p style="font-size:9px;font-weight:bold;text-align:center;margin-bottom:10px;">
        Executed by Authorised Signatory for and on behalf of ${companyName}:
      </p>
      <p style="font-size:10px;">Signature:</p><div class="sig-line"></div>
      <p style="font-size:10px;">Name:</p><div class="sig-line"></div>
      <p style="font-size:10px;">Date:</p><div class="sig-line"></div>
    </div>
  </div>
</body>
</html>`;
}
