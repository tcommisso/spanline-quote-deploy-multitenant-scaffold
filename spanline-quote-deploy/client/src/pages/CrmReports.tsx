import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { Download, FileText, Mail, Search, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Australian Financial Year Helpers ───────────────────────────────────────
function getCurrentFY(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function getFYDateRange(fy: number): { from: string; to: string } {
  return { from: `${fy}-07-01`, to: `${fy + 1}-06-30` };
}

function getFYLabel(fy: number): string {
  return `FY ${fy}/${String(fy + 1).slice(-2)}`;
}

const REPORT_TYPES = [
  { id: "lead_summary", label: "Design Advisor Lead Summary" },
  { id: "product_report", label: "Design Advisor Product Report" },
  { id: "product_sales", label: "Product Sales Summary" },
  { id: "outcome_summary", label: "Outcome Summary" },
  { id: "lead_sources", label: "Lead Sources" },
  { id: "customer_satisfaction", label: "Customer Satisfaction" },
  { id: "correspondence_log", label: "Correspondence Log" },
];

const LETTER_TYPE_LABELS: Record<string, string> = {
  unassigned_intro: "Unassigned Intro",
  assigned_intro: "Assigned Intro",
  welcome_letter: "Welcome Letter",
  council_intro: "Council Intro",
  council_out_of: "Council Out Of",
  council_no_council: "No Council",
};

export default function CrmReports() {
  const [activeReport, setActiveReport] = useState("lead_summary");
  const swipeRef = useSwipeTabs({
    tabs: REPORT_TYPES.map(r => r.id),
    activeTab: activeReport,
    onTabChange: setActiveReport,
  });
  const [selectedFY, setSelectedFY] = useState<number>(getCurrentFY());
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [advisorFilter, setAdvisorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");

  // Compute effective date range from FY or custom dates
  const fyRange = useMemo(() => getFYDateRange(selectedFY), [selectedFY]);
  const dateFrom = useCustomDates ? customDateFrom : fyRange.from;
  const dateTo = useCustomDates ? customDateTo : fyRange.to;

  // Generate FY options (current + 5 years back)
  const fyOptions = useMemo(() => {
    const current = getCurrentFY();
    const opts: number[] = [];
    for (let i = current; i >= current - 5; i--) opts.push(i);
    return opts;
  }, []);

  const [emailSearch, setEmailSearch] = useState("");
  const [emailTypeFilter, setEmailTypeFilter] = useState("");

  const { data: allLeads } = trpc.crm.leads.list.useQuery({ limit: 1000, offset: 0 });
  const leads = allLeads?.leads || [];

  const { data: emailLog } = trpc.crm.emailLog.useQuery(
    { search: emailSearch || undefined, letterType: emailTypeFilter || undefined, startDate: dateFrom || undefined, endDate: dateTo || undefined },
    { enabled: activeReport === "correspondence_log" }
  );

  // Filter leads by date range
  const filteredLeads = useMemo(() => {
    let result = leads;
    if (dateFrom) result = result.filter(l => l.createdAt && new Date(l.createdAt) >= new Date(dateFrom));
    if (dateTo) result = result.filter(l => l.createdAt && new Date(l.createdAt) <= new Date(dateTo + "T23:59:59"));
    if (advisorFilter) result = result.filter(l => l.designAdvisor === advisorFilter);
    if (statusFilter) result = result.filter(l => l.status === statusFilter);
    if (productFilter) result = result.filter(l => l.productType === productFilter);
    return result;
  }, [leads, dateFrom, dateTo, advisorFilter, statusFilter, productFilter]);

  // Get unique values for filters
  const advisors = useMemo(() => Array.from(new Set(leads.map(l => l.designAdvisor).filter(Boolean))), [leads]);
  const products = useMemo(() => Array.from(new Set(leads.map(l => l.productType).filter(Boolean))), [leads]);

  // Report data generators
  const reportData = useMemo(() => {
    switch (activeReport) {
      case "lead_summary": {
        const byAdvisor = new Map<string, { total: number; new: number; quoted: number; contract: number; completed: number; cancelled: number }>();
        filteredLeads.forEach(l => {
          const adv = l.designAdvisor || "Unassigned";
          const curr = byAdvisor.get(adv) || { total: 0, new: 0, quoted: 0, contract: 0, completed: 0, cancelled: 0 };
          curr.total++;
          if (l.status === "new" || l.status === "assigned") curr.new++;
          else if (l.status === "quoted") curr.quoted++;
          else if (l.status === "contract") curr.contract++;
          else if (l.status === "completed") curr.completed++;
          else if (l.status === "cancelled") curr.cancelled++;
          byAdvisor.set(adv, curr);
        });
        return { headers: ["Advisor", "Total", "New/Assigned", "Quoted", "Contract", "Completed", "Cancelled"], rows: Array.from(byAdvisor.entries()).map(([adv, d]) => [adv, d.total, d.new, d.quoted, d.contract, d.completed, d.cancelled]) };
      }
      case "product_report": {
        const byProduct = new Map<string, { total: number; quoted: number; contract: number; completed: number }>();
        filteredLeads.forEach(l => {
          const prod = l.productType || "Unknown";
          const curr = byProduct.get(prod) || { total: 0, quoted: 0, contract: 0, completed: 0 };
          curr.total++;
          if (l.status === "quoted") curr.quoted++;
          else if (l.status === "contract") curr.contract++;
          else if (l.status === "completed") curr.completed++;
          byProduct.set(prod, curr);
        });
        return { headers: ["Product", "Total Leads", "Quoted", "Contract", "Completed"], rows: Array.from(byProduct.entries()).map(([p, d]) => [p, d.total, d.quoted, d.contract, d.completed]) };
      }
      case "product_sales": {
        const byProduct = new Map<string, number>();
        filteredLeads.filter(l => l.status === "contract" || l.status === "completed").forEach(l => {
          const prod = l.productType || "Unknown";
          byProduct.set(prod, (byProduct.get(prod) || 0) + 1);
        });
        return { headers: ["Product", "Sales Count", "% of Total"], rows: Array.from(byProduct.entries()).map(([p, c]) => [p, c, filteredLeads.length > 0 ? ((c / filteredLeads.length) * 100).toFixed(1) + "%" : "0%"]) };
      }
      case "outcome_summary": {
        const byOutcome = new Map<string, number>();
        filteredLeads.forEach(l => {
          const out = l.outcome || "Pending";
          byOutcome.set(out, (byOutcome.get(out) || 0) + 1);
        });
        return { headers: ["Outcome", "Count", "% of Total"], rows: Array.from(byOutcome.entries()).map(([o, c]) => [o, c, filteredLeads.length > 0 ? ((c / filteredLeads.length) * 100).toFixed(1) + "%" : "0%"]) };
      }
      case "lead_sources": {
        const bySource = new Map<string, { total: number; converted: number }>();
        filteredLeads.forEach(l => {
          const src = l.leadSource || "Unknown";
          const curr = bySource.get(src) || { total: 0, converted: 0 };
          curr.total++;
          if (l.status === "contract" || l.status === "completed") curr.converted++;
          bySource.set(src, curr);
        });
        return { headers: ["Source", "Total Leads", "Converted", "Conversion Rate"], rows: Array.from(bySource.entries()).map(([s, d]) => [s, d.total, d.converted, d.total > 0 ? ((d.converted / d.total) * 100).toFixed(1) + "%" : "0%"]) };
      }
      case "customer_satisfaction": {
        return { headers: ["Metric", "Info"], rows: [["Customer satisfaction data", "Available in Customer Review tab per lead"]] };
      }
      default:
        return { headers: [], rows: [] };
    }
  }, [activeReport, filteredLeads]);

  const exportPdf = () => {
    const doc = new jsPDF();
    const title = REPORT_TYPES.find(r => r.id === activeReport)?.label || "Report";
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(9);
    const fyInfo = useCustomDates ? `Custom: ${dateFrom || "Start"} to ${dateTo || "Now"}` : getFYLabel(selectedFY);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | ${fyInfo} | Leads: ${filteredLeads.length}`, 14, 28);
    doc.text(`Date Range: ${dateFrom || "Start"} to ${dateTo || "Now"}`, 14, 34);

    autoTable(doc, {
      startY: dateFrom || dateTo ? 40 : 34,
      head: [reportData.headers],
      body: reportData.rows.map(r => r.map(String)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
    });

    doc.save(`${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM Reports</h1>
          <p className="text-muted-foreground text-sm">
            {useCustomDates
              ? `Custom range: ${dateFrom || "Start"} to ${dateTo || "Now"}`
              : `${getFYLabel(selectedFY)} (${fyRange.from} to ${fyRange.to})`
            } &middot; {filteredLeads.length} leads
          </p>
        </div>
        <Button onClick={exportPdf} disabled={reportData.rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export PDF
        </Button>
      </div>

      {/* Report Type Selector */}
      <div ref={swipeRef}>
      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <TabsList className="h-auto flex-wrap gap-1 p-1">
          {REPORT_TYPES.map(r => (
            <TabsTrigger key={r.id} value={r.id} className="text-xs whitespace-nowrap">{r.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Financial Year</label>
              <Select
                value={useCustomDates ? "custom" : String(selectedFY)}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setUseCustomDates(true);
                    setCustomDateFrom(fyRange.from);
                    setCustomDateTo(fyRange.to);
                  } else {
                    setUseCustomDates(false);
                    setSelectedFY(Number(v));
                  }
                }}
              >
                <SelectTrigger>
                  <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fyOptions.map((fy) => (
                    <SelectItem key={fy} value={String(fy)}>{getFYLabel(fy)}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {useCustomDates && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">From</label>
                  <Input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">To</label>
                  <Input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Advisor</label>
              <Select value={advisorFilter} onValueChange={(v) => setAdvisorFilter(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Advisors</SelectItem>
                  {advisors.map(a => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Select value={productFilter} onValueChange={(v) => setProductFilter(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {products.map(p => <SelectItem key={p} value={p!}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Correspondence Log (special tab) */}
      {activeReport === "correspondence_log" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Correspondence Log
              <span className="text-xs font-normal text-muted-foreground ml-2">({emailLog?.length || 0} emails)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, email, lead number..."
                  value={emailSearch}
                  onChange={(e) => setEmailSearch(e.target.value)}
                />
              </div>
              <Select value={emailTypeFilter} onValueChange={(v) => setEmailTypeFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(LETTER_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(!emailLog || emailLog.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground">No correspondence records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-3 px-3 font-medium">Date</th>
                      <th className="text-left py-3 px-3 font-medium">Lead</th>
                      <th className="text-left py-3 px-3 font-medium">Recipient</th>
                      <th className="text-left py-3 px-3 font-medium">Type</th>
                      <th className="text-left py-3 px-3 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailLog.map((entry: any) => (
                      <tr key={entry.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3 whitespace-nowrap">{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : "—"}</td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-xs">{entry.leadNumber}</span>
                          <span className="ml-2 text-muted-foreground">{entry.contactFirstName} {entry.contactLastName}</span>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{entry.contactEmail || "—"}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-xs">{LETTER_TYPE_LABELS[entry.emailType || ""] || entry.emailType}</Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-[300px] truncate">{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report Table */}
      {activeReport !== "correspondence_log" && <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {REPORT_TYPES.find(r => r.id === activeReport)?.label}
            <span className="text-xs font-normal text-muted-foreground ml-2">({filteredLeads.length} leads)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportData.rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No data available for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {reportData.headers.map((h, i) => (
                      <th key={i} className="text-left py-3 px-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      {row.map((cell, j) => (
                        <td key={j} className="py-2 px-3">{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}
