import type { TourStep } from "@/components/OnboardingTour";

export const TOUR_IDS = {
  workSchedule: "work-schedule",
  constructionDashboard: "construction-dashboard",
  trades: "construction-trades",
  crmLeads: "crm-leads",
  salesDashboard: "sales-dashboard",
  patioDesigner: "patio-designer",
  clientPortal: "client-portal",
  tradePortal: "trade-portal",
} as const;

export const workScheduleTour: TourStep[] = [
  {
    target: "h1",
    title: "Work Schedule Calendar",
    content: "This is your central scheduling hub. View all construction events, installations, inspections, and meetings in one place.",
    position: "bottom",
  },
  {
    target: "[role='combobox']",
    title: "Filter by Trade",
    content: "Use this dropdown to filter the calendar by a specific trade. See exactly when an installer, electrician, or plumber is booked.",
    position: "bottom",
  },
  {
    target: "button:has(.lucide-plus)",
    title: "Create New Events",
    content: "Click here to schedule a new event. Assign it to a job, set the type (installation, inspection, etc.), and optionally assign a trade.",
    position: "bottom",
  },
  {
    target: ".grid.grid-cols-7.gap-px",
    title: "Calendar View",
    content: "Events are colour-coded by type. Click any event to view details, edit, or delete. Click an empty day to quickly create an event on that date.",
    position: "top",
  },
];

export const constructionDashboardTour: TourStep[] = [
  {
    target: "[data-tour='overview-kpis']",
    title: "KPI Overview",
    content: "At a glance, see your active jobs, completed this month, total pipeline value, and on-hold jobs. These update in real-time.",
    position: "bottom",
  },
  {
    target: "[role='tablist']",
    title: "Dashboard Tabs",
    content: "Switch between Overview (charts & stats), Jobs (manage individual jobs), and Trades (manage your trade contacts and send bulk notifications).",
    position: "bottom",
  },
  {
    target: "[data-tour='job-volume-chart']",
    title: "Job Volume Trend",
    content: "Track how many jobs are being created month-over-month. Spot trends and plan capacity accordingly.",
    position: "top",
  },
];

export const tradesTour: TourStep[] = [
  {
    target: "[data-tour='trades-header']",
    title: "Trades Management",
    content: "Manage all your trade contacts here — installers, electricians, plumbers, roofers, and more. Each trade has a type badge for easy identification.",
    position: "bottom",
  },
  {
    target: "[data-tour='trades-select-all']",
    title: "Select & Bulk Actions",
    content: "Use checkboxes to select individual trades, or 'Select All' to choose everyone. Then send bulk SMS or email notifications to the selected group.",
    position: "bottom",
  },
  {
    target: "[data-tour='trades-grid']",
    title: "Trade Cards",
    content: "Each card shows the trade's name, type, phone, email, and status. Use the pencil icon to edit or the trash icon to remove.",
    position: "top",
  },
];

export const salesDashboardTour: TourStep[] = [
  {
    target: "h1",
    title: "Sales Dashboard",
    content: "Your sales command centre. See total quotes, drafts, accepted, and sent at a glance. Recent activity keeps you up to date.",
    position: "bottom",
  },
  {
    target: "button:has(.lucide-plus)",
    title: "Create New Quote",
    content: "Start a new quote from here. Choose between Structure, Deck, or Eclipse quote types depending on the project.",
    position: "left",
  },
];

export const patioDesignerTour: TourStep[] = [
  {
    target: "[data-tour='patio-canvas']",
    title: "Design Canvas",
    content: "This is your main workspace. Upload a house photo and overlay the patio structure to visualise the design in context.",
    position: "bottom",
  },
  {
    target: "[data-tour='patio-tabs']",
    title: "Editor Tabs",
    content: "Switch between Structure (dimensions & roof), Colours (Colorbond selections), Elements (windows & doors), Engineering (RB100 validation), and AI Render tabs.",
    position: "bottom",
  },
  {
    target: "[data-tour='patio-structure']",
    title: "Structure Controls",
    content: "Set the patio width, projection, post height, roof pitch, and style. Changes update the canvas overlay in real-time.",
    position: "right",
  },
  {
    target: "[data-tour='patio-colours']",
    title: "Colour Selections",
    content: "Choose Colorbond colours for roof, beams, posts, gutter, and fascia. The canvas preview updates instantly to reflect your choices.",
    position: "right",
  },
  {
    target: "[data-tour='patio-engineering']",
    title: "Engineering Validation",
    content: "RB100 compliance checks run automatically. Green means compliant, amber is a warning, red means the configuration needs adjustment. Lock engineering once validated.",
    position: "left",
  },
  {
    target: "[data-tour='patio-ai-render']",
    title: "AI Render Generation",
    content: "Generate photorealistic 3D renders of the patio on the house. Choose style presets (Dusk, Aerial, etc.), batch-generate multiple views, and mark favourites for client presentations.",
    position: "left",
  },
  {
    target: "[data-tour='patio-photo-guide']",
    title: "Photo Guide",
    content: "Follow these tips for the best results: capture the full house width at a 30-45° angle, include 1-2m above the roofline, and shoot in good natural light.",
    position: "bottom",
  },
  {
    target: "[data-tour='patio-export']",
    title: "Client Presentation Export",
    content: "Export a professional PDF with the composite image, colour selections, materials list, and AI renders. Attach it to quotes or send directly to clients.",
    position: "bottom",
  },
];

export const clientPortalTour: TourStep[] = [
  {
    target: "[data-tour='portal-nav']",
    title: "Navigation Menu",
    content: "Access all sections of your project portal from here — documents, invoices, contacts, variations, defects, maintenance requests, and more.",
    position: "right",
  },
  {
    target: "[data-tour='portal-status']",
    title: "Project Status",
    content: "See your project's current stage and overall progress at a glance. The progress bar shows how many stages have been completed.",
    position: "bottom",
  },
  {
    target: "[data-tour='portal-updates']",
    title: "Project Updates",
    content: "View the latest activity and communications about your project. Your builder will post updates here as work progresses.",
    position: "bottom",
  },
  {
    target: "[data-tour='portal-documents']",
    title: "Documents",
    content: "Access your contracts, plans, permits, and other project documents. Download them anytime for your records.",
    position: "bottom",
  },
  {
    target: "[data-tour='portal-renders']",
    title: "Design Renders",
    content: "View AI-generated visualisations of your patio design. Click any render to see it full-size or download it.",
    position: "bottom",
  },
  {
    target: "[data-tour='portal-defects']",
    title: "Report Issues",
    content: "If you notice any defects after installation, report them here with photos. Track the status of each reported issue.",
    position: "bottom",
  },
  {
    target: "[data-tour='portal-settings']",
    title: "Notification Settings",
    content: "Manage your notification preferences. Choose whether to receive email alerts about project updates.",
    position: "left",
  },
];

export const tradePortalTour: TourStep[] = [
  {
    target: "[data-tour='trade-kpis']",
    title: "Your Dashboard",
    content: "See your active jobs, upcoming scheduled events, unread messages, and pending invoices at a glance.",
    position: "bottom",
  },
  {
    target: "[data-tour='trade-schedule']",
    title: "Upcoming Schedule",
    content: "View your next scheduled installations, inspections, and other events. Click any event for full details including site address and job notes.",
    position: "bottom",
  },
  {
    target: "[data-tour='trade-jobs']",
    title: "Active Jobs",
    content: "See all jobs currently assigned to you with status, priority, and site address. Click through for full job details and progress updates.",
    position: "top",
  },
  {
    target: "[data-tour='trade-nav']",
    title: "Portal Navigation",
    content: "Access your schedule, availability settings, contact details, remittance advice, invoice submissions, news, site photos, and messages from the sidebar.",
    position: "right",
  },
  {
    target: "[data-tour='trade-availability']",
    title: "Set Availability",
    content: "Let the office know when you're available for work. Update your availability here so scheduling can be done efficiently.",
    position: "bottom",
  },
  {
    target: "[data-tour='trade-invoices']",
    title: "Submit Invoices",
    content: "Upload your invoices directly through the portal. Track submission status and view remittance advice for completed payments.",
    position: "bottom",
  },
];
