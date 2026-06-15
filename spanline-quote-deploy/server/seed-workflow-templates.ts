/**
 * Default Workflow Templates for Building Approvals
 * Covers the 4 most common NSW/ACT pathways:
 * - NSW DA + CC + OC (Development Application → Construction Certificate → Occupation Certificate)
 * - NSW CDC (Complying Development Certificate — combined approval + construction)
 * - ACT DA + BA + COU (Development Application → Building Approval → Certificate of Use)
 * - ACT Exempt/Merit Track (simpler pathway for minor works)
 */

export interface WorkflowGate {
  gateNumber: number;
  name: string;
  description: string;
  blockingConditions: string[];
}

export interface WorkflowState {
  code: string;
  label: string;
  order: number;
  type: "lodgement" | "construction" | "closeout";
}

export interface WorkflowTransition {
  from: string;
  to: string;
  conditions: string[];
  autoTasks: { title: string; taskType: string; description: string }[];
}

export interface DocumentChecklistItem {
  docType: string;
  label: string;
  required: boolean;
  stage: string;
}

// ─── NSW DA + CC + OC ─────────────────────────────────────────────────────────
export const NSW_DA_CC_OC = {
  jurisdiction: "NSW" as const,
  pathwayCode: "NSW_DA_CC_OC",
  name: "NSW Development Application + Construction Certificate + Occupation Certificate",
  description: "Standard NSW pathway: DA lodged with Council, CC issued by PCA/Council, OC on completion. Suits most residential and commercial projects requiring merit assessment.",
  states: [
    { code: "intake", label: "Intake & Assessment", order: 1, type: "lodgement" },
    { code: "da_preparation", label: "DA Preparation", order: 2, type: "lodgement" },
    { code: "da_lodged", label: "DA Lodged", order: 3, type: "lodgement" },
    { code: "da_assessment", label: "DA Under Assessment", order: 4, type: "lodgement" },
    { code: "da_determined", label: "DA Determined", order: 5, type: "lodgement" },
    { code: "cc_preparation", label: "CC Preparation", order: 6, type: "construction" },
    { code: "cc_lodged", label: "CC Lodged", order: 7, type: "construction" },
    { code: "cc_issued", label: "CC Issued", order: 8, type: "construction" },
    { code: "construction", label: "Construction Phase", order: 9, type: "construction" },
    { code: "oc_preparation", label: "OC Preparation", order: 10, type: "closeout" },
    { code: "oc_issued", label: "OC Issued", order: 11, type: "closeout" },
  ] as WorkflowState[],
  gates: [
    { gateNumber: 1, name: "DA Lodgement Ready", description: "All DA documents complete, fees paid, pre-lodgement advice addressed", blockingConditions: ["All DA documents uploaded", "DA application fee paid", "Pre-lodgement issues resolved"] },
    { gateNumber: 2, name: "DA Determined — Consent Granted", description: "DA consent received, conditions reviewed and allocated", blockingConditions: ["DA consent letter received", "Conditions of consent recorded"] },
    { gateNumber: 3, name: "CC Lodgement Ready", description: "CC application pack complete, all pre-commencement conditions satisfied", blockingConditions: ["CC application documents complete", "Pre-commencement conditions satisfied", "Long service levy paid"] },
    { gateNumber: 4, name: "CC Issued — Construction Authorised", description: "CC issued by PCA, ready to commence construction", blockingConditions: ["CC issued", "Principal Certifier appointed", "Builder notification lodged"] },
    { gateNumber: 5, name: "Construction Complete", description: "All mandatory inspections passed, defects rectified", blockingConditions: ["All critical inspections passed", "No outstanding defects", "Final inspection passed"] },
    { gateNumber: 6, name: "OC Issued — Project Complete", description: "Occupation Certificate issued, project closed out", blockingConditions: ["OC application lodged", "All conditions satisfied", "OC issued"] },
  ] as WorkflowGate[],
  transitions: [
    { from: "intake", to: "da_preparation", conditions: ["Pathway confirmed"], autoTasks: [{ title: "Prepare DA document checklist", taskType: "document", description: "Generate document requirements based on development type" }] },
    { from: "da_preparation", to: "da_lodged", conditions: ["Gate 1 passed"], autoTasks: [{ title: "Lodge DA with Council", taskType: "lodgement", description: "Submit DA application via NSW Planning Portal" }, { title: "Pay DA application fee", taskType: "payment", description: "Pay application fee to consent authority" }] },
    { from: "da_lodged", to: "da_assessment", conditions: ["Lodgement confirmed"], autoTasks: [{ title: "Monitor DA assessment progress", taskType: "review", description: "Track assessment milestones and respond to RFIs" }] },
    { from: "da_assessment", to: "da_determined", conditions: ["Determination received"], autoTasks: [{ title: "Review DA conditions", taskType: "review", description: "Review and allocate all conditions of consent" }] },
    { from: "da_determined", to: "cc_preparation", conditions: ["Gate 2 passed"], autoTasks: [{ title: "Prepare CC application pack", taskType: "document", description: "Compile construction certificate documentation" }, { title: "Satisfy pre-commencement conditions", taskType: "review", description: "Address all pre-commencement DA conditions" }] },
    { from: "cc_preparation", to: "cc_lodged", conditions: ["Gate 3 passed"], autoTasks: [{ title: "Lodge CC application", taskType: "lodgement", description: "Submit CC application to PCA" }, { title: "Pay long service levy", taskType: "payment", description: "Pay long service levy" }] },
    { from: "cc_lodged", to: "cc_issued", conditions: ["CC issued"], autoTasks: [{ title: "Appoint Principal Certifier", taskType: "notification", description: "Confirm PC appointment and notify Council" }, { title: "Lodge builder notification (Form 7)", taskType: "notification", description: "Notify Council of builder details" }] },
    { from: "cc_issued", to: "construction", conditions: ["Gate 4 passed"], autoTasks: [{ title: "Schedule mandatory inspections", taskType: "inspection", description: "Book critical stage inspections per CC schedule" }] },
    { from: "construction", to: "oc_preparation", conditions: ["Gate 5 passed"], autoTasks: [{ title: "Prepare OC application", taskType: "document", description: "Compile final inspection reports and compliance docs" }, { title: "Satisfy ongoing conditions", taskType: "review", description: "Confirm all ongoing conditions are met" }] },
    { from: "oc_preparation", to: "oc_issued", conditions: ["Gate 6 passed"], autoTasks: [{ title: "Issue OC", taskType: "notification", description: "Occupation Certificate issued — project complete" }] },
  ] as WorkflowTransition[],
  documentChecklist: [
    { docType: "architectural_plans", label: "Architectural Plans", required: true, stage: "da_preparation" },
    { docType: "site_plan", label: "Site Plan / Survey", required: true, stage: "da_preparation" },
    { docType: "statement_of_environmental_effects", label: "Statement of Environmental Effects (SEE)", required: true, stage: "da_preparation" },
    { docType: "basix_certificate", label: "BASIX Certificate", required: true, stage: "da_preparation" },
    { docType: "bushfire_assessment", label: "Bushfire Assessment (BAL)", required: false, stage: "da_preparation" },
    { docType: "flood_assessment", label: "Flood Impact Assessment", required: false, stage: "da_preparation" },
    { docType: "stormwater_plan", label: "Stormwater Management Plan", required: false, stage: "da_preparation" },
    { docType: "structural_engineering", label: "Structural Engineering Plans", required: true, stage: "cc_preparation" },
    { docType: "geotechnical_report", label: "Geotechnical Report", required: false, stage: "cc_preparation" },
    { docType: "fire_safety_schedule", label: "Fire Safety Schedule", required: false, stage: "cc_preparation" },
    { docType: "energy_compliance", label: "Energy Compliance Report (Section J)", required: false, stage: "cc_preparation" },
    { docType: "final_fire_safety", label: "Final Fire Safety Certificate", required: false, stage: "oc_preparation" },
    { docType: "compliance_certificates", label: "Compliance Certificates (plumbing, electrical)", required: true, stage: "oc_preparation" },
  ] as DocumentChecklistItem[],
};

// ─── NSW CDC ──────────────────────────────────────────────────────────────────
export const NSW_CDC = {
  jurisdiction: "NSW" as const,
  pathwayCode: "NSW_CDC",
  name: "NSW Complying Development Certificate",
  description: "Fast-track NSW pathway for works meeting prescribed standards. Combined planning + construction approval issued by PCA. Suits standard residential alterations, additions, and new dwellings meeting development standards.",
  states: [
    { code: "intake", label: "Intake & Assessment", order: 1, type: "lodgement" },
    { code: "cdc_preparation", label: "CDC Preparation", order: 2, type: "lodgement" },
    { code: "cdc_lodged", label: "CDC Lodged", order: 3, type: "lodgement" },
    { code: "cdc_issued", label: "CDC Issued", order: 4, type: "construction" },
    { code: "construction", label: "Construction Phase", order: 5, type: "construction" },
    { code: "oc_preparation", label: "OC Preparation", order: 6, type: "closeout" },
    { code: "oc_issued", label: "OC Issued", order: 7, type: "closeout" },
  ] as WorkflowState[],
  gates: [
    { gateNumber: 1, name: "CDC Lodgement Ready", description: "All documents complete, compliance demonstrated", blockingConditions: ["All CDC documents uploaded", "Development standards compliance confirmed", "Neighbour notification complete"] },
    { gateNumber: 2, name: "CDC Issued — Construction Authorised", description: "CDC issued, ready to commence", blockingConditions: ["CDC issued", "Principal Certifier appointed", "Commencement notice given (2 days)"] },
    { gateNumber: 3, name: "Construction Complete", description: "All inspections passed", blockingConditions: ["All critical inspections passed", "No outstanding defects"] },
    { gateNumber: 4, name: "OC Issued — Project Complete", description: "Occupation Certificate issued", blockingConditions: ["OC issued", "All CDC conditions satisfied"] },
  ] as WorkflowGate[],
  transitions: [
    { from: "intake", to: "cdc_preparation", conditions: ["CDC eligibility confirmed"], autoTasks: [{ title: "Confirm CDC eligibility against development standards", taskType: "review", description: "Check all applicable codes and standards" }] },
    { from: "cdc_preparation", to: "cdc_lodged", conditions: ["Gate 1 passed"], autoTasks: [{ title: "Lodge CDC application", taskType: "lodgement", description: "Submit CDC to accredited certifier" }, { title: "Notify neighbours", taskType: "notification", description: "Issue neighbour notification (7 days)" }] },
    { from: "cdc_lodged", to: "cdc_issued", conditions: ["CDC issued"], autoTasks: [{ title: "Appoint Principal Certifier", taskType: "notification", description: "Confirm PC and notify Council" }, { title: "Issue commencement notice", taskType: "notification", description: "Give 2 days notice before commencing" }] },
    { from: "cdc_issued", to: "construction", conditions: ["Gate 2 passed"], autoTasks: [{ title: "Schedule mandatory inspections", taskType: "inspection", description: "Book critical stage inspections" }] },
    { from: "construction", to: "oc_preparation", conditions: ["Gate 3 passed"], autoTasks: [{ title: "Prepare OC application", taskType: "document", description: "Compile final documentation" }] },
    { from: "oc_preparation", to: "oc_issued", conditions: ["Gate 4 passed"], autoTasks: [{ title: "Issue OC", taskType: "notification", description: "OC issued — project complete" }] },
  ] as WorkflowTransition[],
  documentChecklist: [
    { docType: "architectural_plans", label: "Architectural Plans", required: true, stage: "cdc_preparation" },
    { docType: "site_plan", label: "Site Plan / Survey", required: true, stage: "cdc_preparation" },
    { docType: "basix_certificate", label: "BASIX Certificate", required: true, stage: "cdc_preparation" },
    { docType: "structural_engineering", label: "Structural Engineering Plans", required: true, stage: "cdc_preparation" },
    { docType: "compliance_report", label: "Code Compliance Report", required: true, stage: "cdc_preparation" },
    { docType: "stormwater_plan", label: "Stormwater Concept Plan", required: false, stage: "cdc_preparation" },
    { docType: "compliance_certificates", label: "Compliance Certificates", required: true, stage: "oc_preparation" },
  ] as DocumentChecklistItem[],
};

// ─── ACT DA + BA + COU ────────────────────────────────────────────────────────
export const ACT_DA_BA_COU = {
  jurisdiction: "ACT" as const,
  pathwayCode: "ACT_DA_BA_COU",
  name: "ACT Development Application + Building Approval + Certificate of Use",
  description: "Standard ACT pathway: DA lodged with ACTPLA, Building Approval from licensed certifier, Certificate of Occupancy/Use on completion. Suits most ACT residential and commercial projects.",
  states: [
    { code: "intake", label: "Intake & Assessment", order: 1, type: "lodgement" },
    { code: "da_preparation", label: "DA Preparation", order: 2, type: "lodgement" },
    { code: "da_lodged", label: "DA Lodged (ACTPLA)", order: 3, type: "lodgement" },
    { code: "da_assessment", label: "DA Under Assessment", order: 4, type: "lodgement" },
    { code: "da_approved", label: "DA Approved", order: 5, type: "lodgement" },
    { code: "ba_preparation", label: "BA Preparation", order: 6, type: "construction" },
    { code: "ba_lodged", label: "BA Lodged", order: 7, type: "construction" },
    { code: "ba_issued", label: "BA Issued", order: 8, type: "construction" },
    { code: "construction", label: "Construction Phase", order: 9, type: "construction" },
    { code: "cou_preparation", label: "COU Preparation", order: 10, type: "closeout" },
    { code: "cou_issued", label: "Certificate of Use Issued", order: 11, type: "closeout" },
  ] as WorkflowState[],
  gates: [
    { gateNumber: 1, name: "DA Lodgement Ready", description: "All DA documents complete for ACTPLA submission", blockingConditions: ["All DA documents uploaded", "DA fee paid", "Entity referrals identified"] },
    { gateNumber: 2, name: "DA Approved", description: "DA approval received, conditions reviewed", blockingConditions: ["DA approval notice received", "Conditions recorded and allocated"] },
    { gateNumber: 3, name: "BA Lodgement Ready", description: "BA application complete, pre-construction conditions satisfied", blockingConditions: ["BA documents complete", "Pre-construction conditions satisfied", "Training levy paid"] },
    { gateNumber: 4, name: "BA Issued — Construction Authorised", description: "Building Approval issued", blockingConditions: ["BA issued", "Licensed builder appointed", "Commencement notice given"] },
    { gateNumber: 5, name: "Construction Complete", description: "All inspections passed, ready for COU", blockingConditions: ["All mandatory inspections passed", "No outstanding defects", "As-built plans submitted"] },
    { gateNumber: 6, name: "COU Issued — Project Complete", description: "Certificate of Use/Occupancy issued", blockingConditions: ["COU application lodged", "All conditions satisfied", "COU issued"] },
  ] as WorkflowGate[],
  transitions: [
    { from: "intake", to: "da_preparation", conditions: ["Pathway confirmed"], autoTasks: [{ title: "Prepare DA document checklist", taskType: "document", description: "Generate ACT-specific document requirements" }] },
    { from: "da_preparation", to: "da_lodged", conditions: ["Gate 1 passed"], autoTasks: [{ title: "Lodge DA with ACTPLA", taskType: "lodgement", description: "Submit via eDevelopment portal" }, { title: "Pay DA fee", taskType: "payment", description: "Pay application fee" }] },
    { from: "da_lodged", to: "da_assessment", conditions: ["Lodgement confirmed"], autoTasks: [{ title: "Monitor DA assessment", taskType: "review", description: "Track entity referrals and respond to RFIs" }] },
    { from: "da_assessment", to: "da_approved", conditions: ["DA approved"], autoTasks: [{ title: "Review DA conditions", taskType: "review", description: "Review and allocate conditions" }] },
    { from: "da_approved", to: "ba_preparation", conditions: ["Gate 2 passed"], autoTasks: [{ title: "Prepare BA application", taskType: "document", description: "Compile building approval documentation" }] },
    { from: "ba_preparation", to: "ba_lodged", conditions: ["Gate 3 passed"], autoTasks: [{ title: "Lodge BA application", taskType: "lodgement", description: "Submit BA to licensed certifier" }, { title: "Pay training levy", taskType: "payment", description: "Pay ACT training levy" }] },
    { from: "ba_lodged", to: "ba_issued", conditions: ["BA issued"], autoTasks: [{ title: "Confirm builder appointment", taskType: "notification", description: "Licensed builder confirmed" }] },
    { from: "ba_issued", to: "construction", conditions: ["Gate 4 passed"], autoTasks: [{ title: "Schedule mandatory inspections", taskType: "inspection", description: "Book ACT mandatory inspection stages" }] },
    { from: "construction", to: "cou_preparation", conditions: ["Gate 5 passed"], autoTasks: [{ title: "Prepare COU application", taskType: "document", description: "Compile completion documentation" }] },
    { from: "cou_preparation", to: "cou_issued", conditions: ["Gate 6 passed"], autoTasks: [{ title: "Issue COU", taskType: "notification", description: "Certificate of Use issued — project complete" }] },
  ] as WorkflowTransition[],
  documentChecklist: [
    { docType: "architectural_plans", label: "Architectural Plans", required: true, stage: "da_preparation" },
    { docType: "site_plan", label: "Site Plan / Survey", required: true, stage: "da_preparation" },
    { docType: "design_response", label: "Design Response Report", required: true, stage: "da_preparation" },
    { docType: "energy_efficiency", label: "Energy Efficiency Rating (EER)", required: true, stage: "da_preparation" },
    { docType: "landscape_plan", label: "Landscape Plan", required: false, stage: "da_preparation" },
    { docType: "structural_engineering", label: "Structural Engineering Plans", required: true, stage: "ba_preparation" },
    { docType: "energy_compliance", label: "Energy Assessment (Section J / NCC)", required: true, stage: "ba_preparation" },
    { docType: "geotechnical_report", label: "Geotechnical Report", required: false, stage: "ba_preparation" },
    { docType: "compliance_certificates", label: "Compliance Certificates", required: true, stage: "cou_preparation" },
    { docType: "as_built_plans", label: "As-Built Plans", required: true, stage: "cou_preparation" },
  ] as DocumentChecklistItem[],
};

// ─── ACT Exempt / Merit Track ─────────────────────────────────────────────────
export const ACT_EXEMPT_MERIT = {
  jurisdiction: "ACT" as const,
  pathwayCode: "ACT_EXEMPT_MERIT",
  name: "ACT Exempt / Merit Track (Minor Works)",
  description: "Simplified ACT pathway for exempt development or merit-track minor works. No DA required — proceed directly to Building Approval. Suits carports, pergolas, minor alterations, and other exempt/merit-track development.",
  states: [
    { code: "intake", label: "Intake & Eligibility Check", order: 1, type: "lodgement" },
    { code: "ba_preparation", label: "BA Preparation", order: 2, type: "construction" },
    { code: "ba_lodged", label: "BA Lodged", order: 3, type: "construction" },
    { code: "ba_issued", label: "BA Issued", order: 4, type: "construction" },
    { code: "construction", label: "Construction Phase", order: 5, type: "construction" },
    { code: "completion", label: "Completion & Sign-off", order: 6, type: "closeout" },
  ] as WorkflowState[],
  gates: [
    { gateNumber: 1, name: "Exempt/Merit Eligibility Confirmed", description: "Development confirmed as exempt or merit-track", blockingConditions: ["Exemption criteria verified", "No DA required confirmed"] },
    { gateNumber: 2, name: "BA Lodgement Ready", description: "BA application documents complete", blockingConditions: ["BA documents complete", "Training levy paid"] },
    { gateNumber: 3, name: "BA Issued — Construction Authorised", description: "Building Approval issued", blockingConditions: ["BA issued", "Commencement notice given"] },
    { gateNumber: 4, name: "Construction Complete — Signed Off", description: "All inspections passed, project complete", blockingConditions: ["Final inspection passed", "No outstanding defects"] },
  ] as WorkflowGate[],
  transitions: [
    { from: "intake", to: "ba_preparation", conditions: ["Gate 1 passed"], autoTasks: [{ title: "Confirm exempt/merit eligibility", taskType: "review", description: "Verify development meets exempt or merit-track criteria" }] },
    { from: "ba_preparation", to: "ba_lodged", conditions: ["Gate 2 passed"], autoTasks: [{ title: "Lodge BA application", taskType: "lodgement", description: "Submit BA to certifier" }, { title: "Pay training levy", taskType: "payment", description: "Pay ACT training levy" }] },
    { from: "ba_lodged", to: "ba_issued", conditions: ["BA issued"], autoTasks: [{ title: "Issue commencement notice", taskType: "notification", description: "Give required notice before starting" }] },
    { from: "ba_issued", to: "construction", conditions: ["Gate 3 passed"], autoTasks: [{ title: "Schedule inspections", taskType: "inspection", description: "Book required inspection stages" }] },
    { from: "construction", to: "completion", conditions: ["Gate 4 passed"], autoTasks: [{ title: "Final sign-off", taskType: "notification", description: "Project complete — no COU required for exempt works" }] },
  ] as WorkflowTransition[],
  documentChecklist: [
    { docType: "architectural_plans", label: "Plans & Specifications", required: true, stage: "ba_preparation" },
    { docType: "site_plan", label: "Site Plan", required: true, stage: "ba_preparation" },
    { docType: "structural_engineering", label: "Structural Engineering (if applicable)", required: false, stage: "ba_preparation" },
    { docType: "energy_compliance", label: "Energy Assessment (if applicable)", required: false, stage: "ba_preparation" },
  ] as DocumentChecklistItem[],
};

export const ALL_TEMPLATES = [NSW_DA_CC_OC, NSW_CDC, ACT_DA_BA_COU, ACT_EXEMPT_MERIT];
