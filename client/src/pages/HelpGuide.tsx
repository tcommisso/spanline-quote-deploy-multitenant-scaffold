import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HardHat, CalendarDays, Users, FileText, BarChart3, Search,
  MessageSquare, Mail, Bot, DollarSign, ClipboardList, Fence, Sun,
  Send, Database, Building2, Shield, Globe, Inbox, Contact, Link2,
  Palette, Image, Sparkles,
} from "lucide-react";

interface HelpSection {
  id: string;
  title: string;
  icon: any;
  category: string;
  content: HelpItem[];
}

interface HelpItem {
  question: string;
  answer: string;
}

const helpSections: HelpSection[] = [
  {
    id: "work-schedule",
    title: "Work Schedule Calendar",
    icon: CalendarDays,
    category: "Construction",
    content: [
      {
        question: "How do I view the Work Schedule?",
        answer: "Navigate to Construction > Work Schedule in the sidebar. The calendar shows all scheduled events including installations, inspections, meetings, and deliveries. Use the Month/Week toggle to switch views.",
      },
      {
        question: "How do I create a new schedule event?",
        answer: "Click the '+ New Event' button in the top-right corner. Fill in the event details including title, type (installation, inspection, meeting, delivery, other), date, time, assigned trade, and linked job. Click Create to save.",
      },
      {
        question: "How do I filter events by trade?",
        answer: "Use the 'All Trades' dropdown in the calendar navigation bar. Select a specific trade to see only their assigned events. This helps you quickly check a trade's availability and workload.",
      },
      {
        question: "How do I navigate between dates?",
        answer: "Use the left/right arrows to move forward or backward by one week (in Week view) or one month (in Month view). Click 'Today' to jump back to the current date.",
      },
      {
        question: "How do I edit or delete an event?",
        answer: "Click on any event in the calendar to open its detail panel. From there you can edit the event details or delete it using the respective buttons.",
      },
      {
        question: "What do the event colours mean?",
        answer: "Blue = Installation, Green = Inspection, Purple = Meeting, Amber = Delivery, Grey = Other. Each event type has a distinct colour and icon for quick identification.",
      },
    ],
  },
  {
    id: "trades",
    title: "Trades Management",
    icon: Users,
    category: "Construction",
    content: [
      {
        question: "How do I add a new trade?",
        answer: "Go to Construction Dashboard > Trades tab. Click '+ Add Trade' to open the form. Enter the trade's name, phone, email, and select a Trade Type from the dropdown (Installer, Electrician, Plumber, Roofer, Carpenter, Concreter, Painter, Tiler, Fencer, or Other).",
      },
      {
        question: "How do I edit a trade's details?",
        answer: "On the Trades tab, find the trade card and click the pencil (edit) icon. This opens a dialog pre-filled with their current details. Make your changes and click 'Update Trade'.",
      },
      {
        question: "What are Trade Types?",
        answer: "Trade Types categorise your trades for filtering and organisation. Options include: Installer, Electrician, Plumber, Roofer, Carpenter, Concreter, Painter, Tiler, Fencer, and Other. The type appears as a badge on each trade card.",
      },
      {
        question: "How do I send bulk SMS or email to trades?",
        answer: "On the Trades tab, use the checkboxes to select multiple trades (or click 'Select All'). Once trades are selected, the 'Send Bulk SMS' and 'Send Bulk Email' buttons appear. Click either to compose and send your message to all selected trades at once.",
      },
      {
        question: "How do I check a trade's availability?",
        answer: "Go to Work Schedule and use the 'Filter by Trade' dropdown to select the trade. The calendar will show only events assigned to that trade, giving you a clear view of when they're booked and when they're free.",
      },
    ],
  },
  {
    id: "construction-dashboard",
    title: "Construction Dashboard",
    icon: HardHat,
    category: "Construction",
    content: [
      {
        question: "What do the KPI cards show?",
        answer: "The top KPI cards display: Active Jobs (currently in progress or scheduled), Completed (total finished jobs), Revenue (total revenue with average margin), and This Week (upcoming events in the next 7 days).",
      },
      {
        question: "What is Project Health?",
        answer: "Project Health categorises active jobs by margin: Healthy (≥45% margin), Watch (35–44% margin), and At Risk (<35% margin). This helps you quickly identify jobs that may need attention.",
      },
      {
        question: "How are construction jobs created?",
        answer: "Construction jobs are created from CRM lead conversion. Start with the client lead in CRM, progress it through the contract handover stage, and the linked construction job will appear in Construction.",
      },
      {
        question: "What are the Dashboard tabs?",
        answer: "Overview shows charts and stats (Job Volume Trend, Status Distribution, Revenue & Cost Trend). Jobs lists individual jobs with filtering by status. Calendar shows a mini calendar view. Trades manages your trade contacts.",
      },
      {
        question: "How do I view job details?",
        answer: "Click on any job in the Jobs tab to open the detail panel on the right. This shows the job overview, progress stages, financials, and linked tasks.",
      },
    ],
  },
  {
    id: "project-plan",
    title: "Project Plan & Templates",
    icon: ClipboardList,
    category: "Construction",
    content: [
      {
        question: "What are Project Plan Templates?",
        answer: "Templates define reusable project plans with stages and tasks. Apply a template from the Project Plan or client job screens after the job has been created from CRM.",
      },
      {
        question: "How do I create a template?",
        answer: "Go to Admin > Project Plan Templates. Click '+ New Template', give it a name, then add stages. Each stage can have multiple tasks. Save when complete.",
      },
      {
        question: "How do I duplicate a template?",
        answer: "On the Project Plan Templates page, click the copy icon next to any template. This creates an exact clone with all stages and tasks, named '[Original Name] (Copy)'. You can then edit it independently.",
      },
      {
        question: "How do I use the Kanban board?",
        answer: "Go to Construction > Project Plan to see all tasks across jobs in a Kanban board. Drag tasks between columns (To Do, In Progress, Done) to update their status. Filter by job or assignee.",
      },
    ],
  },
  {
    id: "crm",
    title: "CRM & Leads",
    icon: Contact,
    category: "CRM",
    content: [
      {
        question: "How do I add a new lead?",
        answer: "Go to CRM > Leads and click '+ New Lead'. Enter the lead's contact details, source, and any notes. The lead will appear in your pipeline.",
      },
      {
        question: "How do I convert a lead to a client?",
        answer: "Open the lead detail page and click 'Convert to Client'. This moves the lead to your Clients list and creates a client record with all their details carried over.",
      },
      {
        question: "What are lead statuses?",
        answer: "Leads progress through: New → Contacted → Qualified → Proposal Sent → Won → Lost. Update the status as you progress through your sales process.",
      },
      {
        question: "How do I view CRM reports?",
        answer: "Go to CRM > CRM Reports for analytics including lead conversion rates, pipeline value, source effectiveness, and team performance metrics.",
      },
    ],
  },
  {
    id: "quotes",
    title: "Structure Quotes",
    icon: FileText,
    category: "Sales",
    content: [
      {
        question: "How do I create a new quote?",
        answer: "Go to Sales > Structure Quotes and click '+ New Quote'. Select a client, then use the component tabs (Roof, Channel, Beam, Post, etc.) to add line items. The OPQ dashboard automatically calculates totals.",
      },
      {
        question: "How do quote statuses work?",
        answer: "Quotes progress through: Draft → Sent → Accepted → Lost. Change the status from the quote editor. Notifications are sent to admin on status changes.",
      },
      {
        question: "How do I generate a proposal PDF?",
        answer: "In the quote editor, click 'Generate Proposal'. This creates a branded PDF with cover page, project details, pricing summary, roof diagram, and signature block. You can Preview, Download, or Send to Client via email.",
      },
      {
        question: "How do I duplicate a quote?",
        answer: "From the quotes list, click the duplicate icon on any quote. This creates a copy with all component line items, which you can then modify for a new client or variation.",
      },
    ],
  },
  {
    id: "deck-quotes",
    title: "Deck Quotes",
    icon: Fence,
    category: "Sales",
    content: [
      {
        question: "How do I create a deck quote?",
        answer: "Go to Sales > Deck Quotes and click '+ New Deck Quote'. The wizard guides you through 4 steps: Client & Size, Product & Site conditions, Pricing Calculator, and Presentation/PDF.",
      },
      {
        question: "How does the pricing calculator work?",
        answer: "After entering dimensions, product selection, and site conditions, click 'Calculate Price'. The engine applies material rates, labour multipliers (for slope, access, elevation), waste factors, and your configured margins.",
      },
    ],
  },
  {
    id: "eclipse-quotes",
    title: "Eclipse Louvre Quotes",
    icon: Sun,
    category: "Sales",
    content: [
      {
        question: "How do I create an Eclipse quote?",
        answer: "Go to Sales > Eclipse Quotes and click '+ New Eclipse Quote'. Enter the louvre dimensions and configuration. The system performs a 33-line automated material take-off with trade discounts and labour costing.",
      },
    ],
  },
  {
    id: "proposals",
    title: "Proposals & Signing",
    icon: Send,
    category: "Sales",
    content: [
      {
        question: "How do I send a proposal for e-signature?",
        answer: "From the Proposals page, select a quote and click 'Send for Signature'. The system uses SignWell to create a digital signature request. The client receives an email with a link to review and sign.",
      },
      {
        question: "How do I track proposal status?",
        answer: "The Proposals page shows all sent proposals with their current status (Pending, Viewed, Signed, Declined). You'll receive notifications when a client signs.",
      },
    ],
  },
  {
    id: "ai-assistant",
    title: "AI Assistant",
    icon: Bot,
    category: "Sales",
    content: [
      {
        question: "What can the AI Assistant help with?",
        answer: "The AI Assistant can: suggest component quantities from job descriptions, flag unusually low margins, auto-generate Description of Work for spec sheets, answer pricing rules questions, and provide RB100 engineering span/load data.",
      },
      {
        question: "How do I use the AI Assistant?",
        answer: "Go to Sales > AI Assistant. Type your question in the chat box. The assistant has access to your Sales Data, product pricing, and RB100 engineering tables to provide contextual answers.",
      },
    ],
  },
  {
    id: "financials",
    title: "Financial Overview",
    icon: DollarSign,
    category: "Construction",
    content: [
      {
        question: "What does the Financial Overview show?",
        answer: "The Financial Overview displays project performance metrics including total revenue, costs, margins, and invoicing status. Filter by branch, roof style, or postcode to drill down.",
      },
      {
        question: "How is margin calculated?",
        answer: "Margin = (Revenue - Cost) / Revenue × 100%. The system tracks contract values, actual costs, and calculates real-time margins for each job and across your portfolio.",
      },
    ],
  },
  {
    id: "master-data",
    title: "Sales Data",
    icon: Database,
    category: "Admin",
    content: [
      {
        question: "What is Sales Data?",
        answer: "Sales Data contains all the configuration that drives pricing: markup multipliers, regional rates, council fees, travel bands, complexity loadings, colour lists, and product catalogues.",
      },
      {
        question: "How do I update product pricing?",
        answer: "Go to Admin > Sales Data > Products. Use the inline-editable table to update costs, markups, and sell rates. You can also bulk-import via CSV using the Upload button.",
      },
      {
        question: "How do I add a new region?",
        answer: "In Sales Data, navigate to the Regional Rates section. Add a new region with its specific rate multipliers. These rates are then available when creating quotes.",
      },
    ],
  },
  {
    id: "xero",
    title: "Xero Integration",
    icon: Link2,
    category: "Admin",
    content: [
      {
        question: "How do I connect Xero?",
        answer: "Go to Admin > Xero Integration and click 'Connect to Xero'. You'll be redirected to Xero to authorise the connection. Once connected, financial data syncs automatically.",
      },
      {
        question: "What data syncs with Xero?",
        answer: "The integration syncs invoices, payments, and contact data. Construction job financials pull from Xero to show real-time invoiced/paid/outstanding amounts.",
      },
    ],
  },
  {
    id: "inbox",
    title: "Inbox & Communications",
    icon: Inbox,
    category: "Communications",
    content: [
      {
        question: "How does the Inbox work?",
        answer: "The Inbox consolidates all communications including emails and SMS messages. View, reply, and manage conversations with clients and trades from one place.",
      },
      {
        question: "How do I send SMS?",
        answer: "You can send SMS from multiple places: the Inbox (compose new), a lead/client detail page, or via Bulk SMS from the Trades tab. Messages are sent via the VocPhone integration.",
      },
    ],
  },
  {
    id: "patio-planner",
    title: "Patio Planner / Designer",
    icon: Palette,
    category: "Sales",
    content: [
      {
        question: "What is the Patio Planner?",
        answer: "The Patio Planner is a visual design tool for creating patio proposals. Upload a photo of the client's house, overlay a patio structure with accurate dimensions, choose Colorbond colours, add windows/doors, and generate AI renders — all in one editor.",
      },
      {
        question: "How do I create a new Patio Planner project?",
        answer: "Navigate to Sales > Patio Planner and click '+ New Project'. You can start from scratch or use 'Copy from Quote' to pre-fill dimensions, colours, and window/door selections from an existing OPQ spec sheet.",
      },
      {
        question: "What is the Photo Guide?",
        answer: "The Photo Guide (camera icon in the editor header) provides best-practice tips for taking the ideal house photo: shoot at a 30-45° angle, include 1-2 metres above the roofline, capture the full width of the attachment wall, avoid direct sunlight, and use landscape orientation. Following these tips ensures better AI render results.",
      },
      {
        question: "How do I configure the patio structure?",
        answer: "Use the Structure tab to set roof style (Flyover, Pop-up Skillion, Gable, Hip), dimensions (width, projection, beam height, post height, floor-to-ground), roof pitch, and post count. All measurements are in millimetres.",
      },
      {
        question: "How do I choose Colorbond colours?",
        answer: "Switch to the Colours tab to select individual colours for the roof, beams, posts, gutters, and fascia. The colour picker shows the full Colorbond palette with visual swatches.",
      },
      {
        question: "How do I add windows and doors?",
        answer: "Use the Elements tab to drag-and-drop windows and doors onto the canvas. You can resize, reposition, and delete placed elements. These appear in the materials list and PDF export.",
      },
      {
        question: "What is the RB100 Engineering Validation?",
        answer: "The RB100 tab checks your structure against engineering span tables. Select your wind region (N1-N4, C1-C3), enclosure condition, beam size/type, and post size. The panel shows green (pass), amber (warning), or red (fail) status for beam span, post height, and rafter span. It suggests compliant alternatives when a check fails.",
      },
      {
        question: "How do I lock the engineering configuration?",
        answer: "Once all RB100 checks pass (green status), click 'Lock Engineering' in the validation panel. This freezes the engineering parameters to prevent accidental changes after sign-off. You can unlock later with a confirmation dialog.",
      },
      {
        question: "What is the Materials List?",
        answer: "The Materials tab auto-generates a bill of materials based on your structure dimensions, colours, and placed elements. It includes beams, posts, rafters, roofing sheets, gutters, fascia, and all windows/doors with their specifications.",
      },
      {
        question: "How do I export a Client Presentation PDF?",
        answer: "Click the 'Export PDF' button in the editor header. This generates a professional 3-page PDF with: a composite image of the patio overlaid on the house photo, a colour selections table, a materials/windows list, and any AI renders (if generated).",
      },
    ],
  },
  {
    id: "ai-render",
    title: "AI 3D Renders",
    icon: Sparkles,
    category: "Sales",
    content: [
      {
        question: "What are AI Renders?",
        answer: "AI Renders use GPT image generation to create photorealistic visualisations of the proposed patio structure on the client's actual house photo. They're generated from the spec sheet data (dimensions, colours, roof style) combined with the uploaded photo.",
      },
      {
        question: "How do I generate an AI Render?",
        answer: "Switch to the AI Render tab in the Patio Planner editor. Ensure you have a photo uploaded and structure configured. Choose a render mode (Full for highest quality, Quick for faster results), optionally select a style preset, then click 'Generate Render'.",
      },
      {
        question: "What are Style Presets?",
        answer: "Style Presets modify the render's visual style. Choose from 13 presets across 4 categories: Lighting (Golden Hour, Overcast, Bright Daylight), Camera Angle (Aerial, Street Level, Garden View), Scene Styling (Entertaining Setup, Landscaped), and Time of Day (Twilight, Night). The default 'Standard' preset uses natural daylight.",
      },
      {
        question: "How do I compare renders?",
        answer: "Click the 'Compare' button in the AI Render tab. This opens a side-by-side slider view where you can compare the original photo against any render, or compare two different renders. Drag the slider to reveal each image.",
      },
      {
        question: "How do I mark a render as favourite?",
        answer: "Click the star icon on any render in the gallery. Favourited renders appear first in the gallery and are auto-selected when attaching renders to quote emails.",
      },
      {
        question: "What is Batch Generate?",
        answer: "Batch Generate creates multiple renders with different style presets in one click. Select 2-4 presets from the batch dialog and click Generate All. Each render is generated sequentially and added to your gallery.",
      },
      {
        question: "Are renders watermarked?",
        answer: "Yes. All AI renders are automatically watermarked with the company logo and '© Altaspan [year]' in the bottom-right corner. This protects your intellectual property when sharing renders with clients.",
      },
      {
        question: "How do I attach a render to a quote email?",
        answer: "When sending a quote via the Send for Signature or Send Proposal dialogs, toggle 'Attach AI Render'. The system auto-selects your favourited render (or latest render if none is favourited). A thumbnail preview shows which render will be included.",
      },
      {
        question: "Can clients see their renders?",
        answer: "Yes. The Client Portal includes a 'Design Renders' page where clients can view all renders generated for their project in a gallery format. They can view full-size images and download them.",
      },
    ],
  },
  {
    id: "portal",
    title: "Client Portal",
    icon: Globe,
    category: "Admin",
    content: [
      {
        question: "What is the Client Portal?",
        answer: "The Client Portal gives your clients a self-service view of their projects. They can see project progress, view documents, track invoices, report defects, request maintenance, view AI design renders, and manage their notification preferences.",
      },
      {
        question: "How do I manage portal access?",
        answer: "Go to Admin > Client Portal Management to configure portal settings, manage client access, and customise what information is visible to clients.",
      },
      {
        question: "What can clients see in the portal?",
        answer: "Clients have access to: Dashboard (project status overview), Documents (contracts & plans), Invoices (payment history), Contacts (project team), Variations (change requests), Defects (issue reporting), Maintenance (service requests), Design Renders (AI visualisations), Care Plans (CPC subscription), News, and Products.",
      },
      {
        question: "What is the Design Renders gallery?",
        answer: "The Design Renders page in the Client Portal shows all AI-generated renders for the client's project. Clients can view renders in a lightbox gallery and download them. Only renders from linked Patio Planner projects are shown.",
      },
    ],
  },
  {
    id: "onboarding-tours",
    title: "Interactive Tours",
    icon: HardHat,
    category: "Getting Started",
    content: [
      {
        question: "How do I start a tour?",
        answer: "Look for the 'Tour' button in the header area of pages that support tours. Click it to start a guided walkthrough of that page's features.",
      },
      {
        question: "Can I replay a tour?",
        answer: "Yes! Click the 'Tour' button at any time to replay the tour. Tours are remembered in your browser, so they won't auto-start again after you've completed them once.",
      },
      {
        question: "Which pages have tours?",
        answer: "Tours are available on: Construction Dashboard (KPIs, tabs, charts), Trades tab (trade management, bulk actions), Work Schedule (calendar navigation, event creation), Patio Designer (canvas, structure, colours, engineering, AI render), Client Portal (project status, navigation, documents, defects), and Trade Portal (KPIs, schedule, jobs, navigation).",
      },
    ],
  },
];

const categories = ["Getting Started", "CRM", "Sales", "Construction", "Communications", "Admin"];

export default function HelpGuide() {
  const [searchQuery, setSearchQuery] = useState("");
  const search = useSearch();
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to section when ?section=xxx is in the URL
  useEffect(() => {
    const params = new URLSearchParams(search);
    const sectionId = params.get("section");
    if (sectionId && sectionRefs.current[sectionId]) {
      setTimeout(() => {
        sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [search]);

  const handlePrintPdf = () => {
    window.print();
  };

  const filteredSections = helpSections.filter((section) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (section.title.toLowerCase().includes(q)) return true;
    if (section.category.toLowerCase().includes(q)) return true;
    return section.content.some(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
    );
  });

  const groupedSections = categories
    .map((cat) => ({
      category: cat,
      sections: filteredSections.filter((s) => s.category === cat),
    }))
    .filter((g) => g.sections.length > 0);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Help Guide</h1>
          <p className="text-muted-foreground">
            Find answers to common questions about using the Altaspan Costing &amp; Quoting System.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrintPdf} className="print:hidden gap-2">
          <Printer className="h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search help topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {groupedSections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
            <p className="text-sm text-muted-foreground mt-1">Try different keywords or browse all sections below.</p>
          </CardContent>
        </Card>
      ) : (
        groupedSections.map((group) => (
          <div key={group.category} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                {group.category}
              </Badge>
            </h2>
            <div className="space-y-3">
              {group.sections.map((section) => {
                const Icon = section.icon;
                return (
                  <Card key={section.id} ref={(el) => { sectionRefs.current[section.id] = el; }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4 text-primary" />
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="multiple" className="w-full">
                        {section.content
                          .filter((item) => {
                            if (!searchQuery) return true;
                            const q = searchQuery.toLowerCase();
                            return (
                              item.question.toLowerCase().includes(q) ||
                              item.answer.toLowerCase().includes(q)
                            );
                          })
                          .map((item, idx) => (
                            <AccordionItem key={idx} value={`${section.id}-${idx}`}>
                              <AccordionTrigger className="text-sm text-left hover:no-underline">
                                {item.question}
                              </AccordionTrigger>
                              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                                {item.answer}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* What's New */}
      {!searchQuery && (
        <div className="space-y-3" ref={(el) => { sectionRefs.current["whats-new"] = el; }}>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-normal">What's New</Badge>
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sun className="h-4 w-4 text-primary" />
                Recent Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-l-2 border-green-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-100 text-green-800 text-xs">New Feature</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">In-App Help Guide</p>
                  <p className="text-sm text-muted-foreground">Searchable help page with FAQ sections covering all major features, accessible from the sidebar.</p>
                </div>
                <div className="border-l-2 border-green-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-100 text-green-800 text-xs">New Feature</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Interactive Onboarding Tours</p>
                  <p className="text-sm text-muted-foreground">Step-by-step guided tours on the Construction Dashboard and Work Schedule pages. Click the "Tour" button to start.</p>
                </div>
                <div className="border-l-2 border-green-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-100 text-green-800 text-xs">New Feature</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Trade Type Dropdown</p>
                  <p className="text-sm text-muted-foreground">Trades now have a standardised type (Installer, Electrician, Plumber, Roofer, etc.) for consistent categorisation.</p>
                </div>
                <div className="border-l-2 border-green-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-100 text-green-800 text-xs">New Feature</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Bulk SMS & Email for Trades</p>
                  <p className="text-sm text-muted-foreground">Select multiple trades and send bulk SMS or email notifications directly from the Trades tab.</p>
                </div>
                <div className="border-l-2 border-green-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-100 text-green-800 text-xs">New Feature</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Trade Availability Filter</p>
                  <p className="text-sm text-muted-foreground">Filter the Work Schedule calendar by trade to quickly see when specific trades are booked or available.</p>
                </div>
                <div className="border-l-2 border-green-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-100 text-green-800 text-xs">New Feature</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Duplicate Project Plan Templates</p>
                  <p className="text-sm text-muted-foreground">Clone existing project plan templates with all stages and tasks using the new duplicate button.</p>
                </div>
                <div className="border-l-2 border-blue-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-blue-100 text-blue-800 text-xs">Improvement</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Trades Section Renamed</p>
                  <p className="text-sm text-muted-foreground">"Installers" section renamed to "Trades" to accommodate electricians, plumbers, and other trade types.</p>
                </div>
                <div className="border-l-2 border-amber-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-amber-100 text-amber-800 text-xs">Fix</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Convert to Client Dialog</p>
                  <p className="text-sm text-muted-foreground">Fixed the confirm button text from "Delete" to "Convert to Client" in the lead conversion dialog.</p>
                </div>
                <div className="border-l-2 border-amber-500 pl-4 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-amber-100 text-amber-800 text-xs">Fix</Badge>
                    <span className="text-xs text-muted-foreground">May 2026</span>
                  </div>
                  <p className="text-sm font-medium">Construction Dashboard Charts</p>
                  <p className="text-sm text-muted-foreground">Fixed Job Volume Trend and Revenue charts that were failing due to a database query pattern issue.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer */}
      <Card className="bg-muted/50">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Can't find what you're looking for? Use the interactive tours on each page for a guided walkthrough,
            or contact your system administrator for further assistance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
