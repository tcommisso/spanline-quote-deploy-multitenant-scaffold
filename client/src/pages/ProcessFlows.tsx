import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  DollarSign,
  Factory,
  FileCheck,
  FileText,
  GitBranch,
  Link2,
  MessageSquare,
  Printer,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Tone = "blue" | "green" | "amber" | "red" | "violet" | "slate";

type FlowStep = {
  label: string;
  owner: string;
  detail: string;
  icon: LucideIcon;
  tone: Tone;
};

type ProcessFlow = {
  title: string;
  module: string;
  summary: string;
  icon: LucideIcon;
  steps: FlowStep[];
  gates: string[];
  records: string[];
  integrations: string[];
};

const toneClasses: Record<Tone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
  slate: "border-slate-200 bg-slate-50 text-slate-800",
};

const flows: ProcessFlow[] = [
  {
    title: "Lead to Client",
    module: "CRM",
    summary: "From lead capture through qualification, appointment, quote, contract, and client handover.",
    icon: Users,
    steps: [
      { label: "Lead Created", owner: "CRM", detail: "Zapier, manual entry, or web form creates the lead.", icon: Users, tone: "blue" },
      { label: "Advisor Assigned", owner: "Sales", detail: "Territory and advisor rules allocate ownership.", icon: ClipboardCheck, tone: "violet" },
      { label: "Appointment Set", owner: "Calendar", detail: "Availability and invitees are checked before booking.", icon: CalendarDays, tone: "amber" },
      { label: "Quote Prepared", owner: "Sales", detail: "Structure, deck, eclipse, or patio quote is built.", icon: FileText, tone: "blue" },
      { label: "Proposal Sent", owner: "Proposal", detail: "Client receives proposal and supporting documents.", icon: MessageSquare, tone: "green" },
      { label: "Won Client", owner: "CRM", detail: "Lead moves to won/client and creates downstream work.", icon: CheckCircle2, tone: "green" },
    ],
    gates: ["Lead source and advisor required", "Quote value triggers approval checks", "Won status creates construction visibility"],
    records: ["crm_leads", "crm_contracts", "client_activities", "appointments"],
    integrations: ["Zapier", "O365/Nylas calendar", "SignWell", "Xero contacts"],
  },
  {
    title: "Quote to Contract",
    module: "Sales",
    summary: "Pricing, site data, renders, proposal documents, and signed contract preparation.",
    icon: FileText,
    steps: [
      { label: "Site Address", owner: "Quote", detail: "Address lookup populates structured site details.", icon: Link2, tone: "blue" },
      { label: "Product Scope", owner: "Quote", detail: "Selected product engine calculates materials and options.", icon: ClipboardCheck, tone: "violet" },
      { label: "Pricing Rules", owner: "Admin Data", detail: "Regional pricing, markup, surcharges, and fees apply.", icon: DollarSign, tone: "green" },
      { label: "AI/Visual Assets", owner: "Planner", detail: "Photos, renders, and site plans support the proposal.", icon: Bot, tone: "amber" },
      { label: "Proposal Pack", owner: "Proposal", detail: "PDF and email content are generated for approval.", icon: FileCheck, tone: "blue" },
      { label: "Contract Ready", owner: "Sales", detail: "Accepted quote becomes a contract and client record.", icon: CheckCircle2, tone: "green" },
    ],
    gates: ["Required quote fields complete", "HBCF required for NSW quotes at or above $20K", "Signed acceptance before job handover"],
    records: ["quotes", "deck_quotes", "eclipse_quotes", "proposal_documents", "crm_contracts"],
    integrations: ["OpenAI image/render services", "LocationIQ/OpenStreetMap", "R2 storage", "O365 email"],
  },
  {
    title: "Approvals and HBCF",
    module: "Approvals",
    summary: "Approval pathway, project tasks, HBCF certificates, commencement gate, and competitor intelligence.",
    icon: ShieldCheck,
    steps: [
      { label: "Pathway Assessment", owner: "Approvals", detail: "DA, CDC, BA, exempt, and HBCF needs are identified.", icon: GitBranch, tone: "blue" },
      { label: "Approval Project", owner: "Approvals", detail: "Project tasks, RFIs, inspections, and documents are tracked.", icon: ClipboardCheck, tone: "violet" },
      { label: "HBCF Flag", owner: "HBCF", detail: "NSW fixed-price jobs over threshold are flagged.", icon: AlertTriangle, tone: "amber" },
      { label: "Certificate Issued", owner: "HBCF", detail: "Certificate record links to quote, lead, and property.", icon: FileCheck, tone: "green" },
      { label: "CCC Gate", owner: "Approvals", detail: "Construction Commencement Certificate is blocked until HBCF is issued.", icon: ShieldCheck, tone: "red" },
      { label: "Competitor Scan", owner: "Intel", detail: "HBCF and DA records are compared with open leads.", icon: Database, tone: "slate" },
    ],
    gates: ["HBCF applies to NSW only", "CCC cannot issue without HBCF where required", "Auto-lost matches retain undo trail"],
    records: ["approval_projects", "approval_tasks", "hbcf_certificates", "client_das", "da_competitor_watchlist"],
    integrations: ["HBCF API NSW", "ACT ArcGIS", "NSW Planning Portal", "Railway cron"],
  },
  {
    title: "Construction Delivery",
    module: "Build",
    summary: "Won clients become active jobs with schedules, plans, work crews, invoicing, and completion health.",
    icon: ClipboardCheck,
    steps: [
      { label: "Active Job", owner: "Build", detail: "Won or construction leads appear as active jobs.", icon: Users, tone: "blue" },
      { label: "Check Measure", owner: "Build", detail: "Site details, plans, and measurements are confirmed.", icon: ClipboardCheck, tone: "violet" },
      { label: "Project Plan", owner: "Build", detail: "Templates seed kanban tasks for the job.", icon: GitBranch, tone: "amber" },
      { label: "Work Schedule", owner: "Build", detail: "Trades, installers, and availability drive scheduling.", icon: CalendarDays, tone: "blue" },
      { label: "Job Actuals", owner: "Finance", detail: "Invoices, costs, and margin are matched back to the job.", icon: DollarSign, tone: "green" },
      { label: "Completion", owner: "Clients", detail: "Closed date, client health, defects, reviews, and CPC are tracked.", icon: CheckCircle2, tone: "green" },
    ],
    gates: ["Job must be linked to a lead/client", "Approvals/HBCF gates checked before commencement", "Completion date follows Xero closed project date"],
    records: ["construction_projects", "construction_tasks", "calendar_events", "portal_defects", "customer_reviews"],
    integrations: ["Xero Projects", "O365/Nylas calendar", "Client portal", "Open-Meteo weather"],
  },
  {
    title: "Xero Finance Sync",
    module: "Finance",
    summary: "Xero entities, contacts, projects, account numbers, transactions, and dashboards stay aligned.",
    icon: DollarSign,
    steps: [
      { label: "Entity Connected", owner: "Admin", detail: "Each Xero organisation is connected and scoped.", icon: Link2, tone: "blue" },
      { label: "Contact Sync", owner: "Finance", detail: "Clients and suppliers sync with account numbers.", icon: Users, tone: "violet" },
      { label: "Project Mapping", owner: "Finance", detail: "Xero project records are matched to app clients.", icon: GitBranch, tone: "amber" },
      { label: "Transaction Sync", owner: "Finance", detail: "Invoices, payments, bills, and costs are imported.", icon: Database, tone: "slate" },
      { label: "Actuals", owner: "Build", detail: "Matched project totals appear on client and job screens.", icon: DollarSign, tone: "green" },
      { label: "Reports", owner: "Reporting", detail: "Dashboards and exports use the reconciled finance data.", icon: FileCheck, tone: "blue" },
    ],
    gates: ["Supplier sync is entity-scoped", "Client number maps to Xero account number", "Closed project date is the completion source"],
    records: ["xero_connections", "xero_entities", "xero_contacts", "xero_project_financials", "xero_transactions"],
    integrations: ["Xero OAuth", "Xero Accounting API", "Xero Projects API", "Railway cron"],
  },
  {
    title: "Manufacturing and Inventory",
    module: "Manufacturing",
    summary: "Manufacturing orders, component catalogue, purchase orders, stock movement, dispatch, and supplier tracking.",
    icon: Factory,
    steps: [
      { label: "Order Raised", owner: "Manufacturing", detail: "Smartshop or manual order creates manufacturing demand.", icon: Factory, tone: "blue" },
      { label: "Components", owner: "Catalogue", detail: "Products, BOMs, and stock codes drive requirements.", icon: Database, tone: "violet" },
      { label: "Inventory PO", owner: "Procurement", detail: "Manufacturing suppliers receive purchase orders.", icon: FileText, tone: "amber" },
      { label: "Receive Goods", owner: "Warehouse", detail: "Partial or full receipts create stock movements.", icon: CheckCircle2, tone: "green" },
      { label: "Allocate Stock", owner: "Warehouse", detail: "Stock is consumed, transferred, or returned with audit trail.", icon: ClipboardCheck, tone: "slate" },
      { label: "Dispatch", owner: "Logistics", detail: "QR codes, drivers, delivery calendar, and tracking complete the loop.", icon: Truck, tone: "blue" },
    ],
    gates: ["Manufacturing suppliers use the manufacturing Xero entity", "PO approvals block issuing above threshold", "Receipts update stock balances"],
    records: ["manufacturing_orders", "component_catalogue_products", "inventory_purchase_orders", "inventory_movements", "dispatch_jobs"],
    integrations: ["Xero suppliers", "O365 supplier email", "R2 PDF storage", "VOCPhone/live tracking"],
  },
  {
    title: "Client Portal and Post Construction",
    module: "Clients",
    summary: "Portal access, completion actions, maintenance letters, reviews, subscriptions, and defect follow-up.",
    icon: MessageSquare,
    steps: [
      { label: "Portal Enabled", owner: "Clients", detail: "Client access is linked to the lead and project.", icon: Link2, tone: "blue" },
      { label: "Project Updates", owner: "Build", detail: "Documents, activity, and messages are surfaced to the client.", icon: MessageSquare, tone: "violet" },
      { label: "Construction Complete", owner: "Build", detail: "Completed jobs enter the client health view.", icon: CheckCircle2, tone: "green" },
      { label: "Maintenance Letter", owner: "Admin", detail: "Maintenance communication status is tracked.", icon: FileText, tone: "amber" },
      { label: "Review and CPC", owner: "Clients", detail: "Customer review and subscription status are monitored.", icon: Users, tone: "blue" },
      { label: "Defects", owner: "Support", detail: "Portal defects remain visible until resolved.", icon: AlertTriangle, tone: "red" },
    ],
    gates: ["Portal access must be active", "Defects stay open until resolved", "Clients tab surfaces health indicators"],
    records: ["portal_access", "portal_defects", "customer_reviews", "cpc_subscriptions", "client_activities"],
    integrations: ["Client portal", "O365 email", "Climbo/review links", "Support inbox"],
  },
  {
    title: "System Integrations",
    module: "Platform",
    summary: "Authentication, email, AI, telephony, storage, scheduled polling, and API health monitoring.",
    icon: Bot,
    steps: [
      { label: "O365 Auth", owner: "Identity", detail: "Users authenticate through Microsoft Entra.", icon: ShieldCheck, tone: "blue" },
      { label: "Graph Email", owner: "Inbox", detail: "Shared mailboxes send and receive app email.", icon: MessageSquare, tone: "violet" },
      { label: "Calendar", owner: "Scheduling", detail: "Appointments and availability use connected calendars.", icon: CalendarDays, tone: "amber" },
      { label: "Engini", owner: "AI", detail: "OpenAI powers technical assistant responses and transcription.", icon: Bot, tone: "green" },
      { label: "Storage", owner: "Platform", detail: "R2 stores uploads, PDFs, images, and assets.", icon: Database, tone: "slate" },
      { label: "Health and Cron", owner: "System", detail: "Scheduled jobs and API health checks record status.", icon: CheckCircle2, tone: "blue" },
    ],
    gates: ["Only configured providers are marked ready", "Scheduled endpoints require job secret", "API Health records last success and error"],
    records: ["tenant_integrations", "api_health_checks", "scheduled_job_logs", "nylas_grants", "notification_log"],
    integrations: ["Microsoft Graph", "Nylas", "OpenAI", "Cloudflare R2", "VOCPhone", "SignWell", "Zapier"],
  },
];

function StepNode({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  const Icon = step.icon;

  return (
    <div className="relative">
      <div className="min-h-[168px] rounded-lg border bg-card p-4 shadow-sm">
        <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border ${toneClasses[step.tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{step.label}</p>
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{step.owner}</p>
          </div>
          <p className="text-sm leading-snug text-muted-foreground">{step.detail}</p>
        </div>
      </div>
      {!isLast && (
        <>
          <div className="hidden xl:flex absolute left-full top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="mx-auto h-5 w-px bg-border xl:hidden" />
        </>
      )}
    </div>
  );
}

function DetailPanel({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="whitespace-normal rounded-md px-2 py-1 text-left font-medium">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export default function ProcessFlows() {
  const [page, setPage] = useState(0);
  const flow = flows[page];
  const FlowIcon = flow.icon;
  const pageLabel = useMemo(() => `${page + 1} of ${flows.length}`, [page]);

  const goToPrevious = () => setPage((current) => Math.max(0, current - 1));
  const goToNext = () => setPage((current) => Math.min(flows.length - 1, current + 1));

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
            <GitBranch className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">App process map</p>
            <h1 className="text-3xl font-bold tracking-normal text-foreground">Process Flows</h1>
            <p className="mt-1 max-w-3xl text-muted-foreground">{flow.summary}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Badge variant="outline" className="rounded-md px-3 py-2">{pageLabel}</Badge>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button type="button" variant="outline" onClick={goToPrevious} disabled={page === 0} aria-label="Previous flow">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" onClick={goToNext} disabled={page === flows.length - 1} aria-label="Next flow">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8 print:hidden">
        {flows.map((item, index) => {
          const Icon = item.icon;
          const isActive = index === page;

          return (
            <button
              key={item.title}
              type="button"
              onClick={() => setPage(index)}
              className={`min-h-[76px] rounded-lg border p-3 text-left transition ${
                isActive ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/50"
              }`}
            >
              <Icon className="mb-2 h-4 w-4" />
              <span className="block text-sm font-semibold leading-tight">{item.title}</span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b bg-muted/30 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background text-primary">
                  <FlowIcon className="h-5 w-5" />
                </div>
                <div>
                  <Badge variant="secondary" className="mb-1 rounded-md">{flow.module}</Badge>
                  <h2 className="text-2xl font-bold tracking-normal">{flow.title}</h2>
                </div>
              </div>
              <div className="text-sm font-medium text-muted-foreground">{pageLabel}</div>
            </div>
          </div>

          <div className="grid gap-0 p-4 sm:p-6 xl:grid-cols-6 xl:gap-4">
            {flow.steps.map((step, index) => (
              <StepNode key={`${flow.title}-${step.label}`} step={step} isLast={index === flow.steps.length - 1} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <DetailPanel title="Control Gates" icon={ShieldCheck} items={flow.gates} />
        <DetailPanel title="Primary Records" icon={Database} items={flow.records} />
        <DetailPanel title="External Services" icon={Link2} items={flow.integrations} />
      </div>
    </div>
  );
}
