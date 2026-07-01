import { Toaster } from "@/components/ui/sonner";
import { lazy, Suspense, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { useAuth } from "./_core/hooks/useAuth";
import { useEffectivePermissions } from "./hooks/useEffectivePermissions";
import { useFavicon } from "./hooks/useFavicon";
import { useInstallSurfaceMetadata } from "./hooks/useInstallSurfaceMetadata";
import MasterDataLayout from "./components/MasterDataLayout";
import Home from "./pages/Home";
import AppCentral from "./pages/AppCentral";
import AdminRoute from "./components/AdminRoute";

// Lazy-loaded pages for code splitting
const QuoteList = lazy(() => import("./pages/QuoteList"));
const QuoteEditor = lazy(() => import("./pages/QuoteEditor"));
const AssistantPage = lazy(() => import("./pages/AssistantPage"));
import { FloatingAIChat } from "./components/FloatingAIChat";
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminSectionTemplates = lazy(() => import("./pages/AdminSectionTemplates"));
const AdminEmailTemplates = lazy(() => import("./pages/AdminEmailTemplates"));
const AnalyticsDashboard = lazy(() => import("./pages/AnalyticsDashboard"));
const DeckQuoteList = lazy(() => import("./pages/DeckQuoteList"));
const DeckQuoteEditor = lazy(() => import("./pages/DeckQuoteEditor"));
const EclipseQuoteList = lazy(() => import("./pages/EclipseQuoteList"));
const EclipseQuoteEditor = lazy(() => import("./pages/EclipseQuoteEditor"));
const EclipseQuoteDiagnostics = lazy(() => import("./pages/EclipseQuoteDiagnostics"));
const SecurityScreenQuote = lazy(() => import("./pages/SecurityScreenQuote"));
const BlindsQuote = lazy(() => import("./pages/BlindsQuote"));
const QuotePreview = lazy(() => import("./pages/QuotePreview"));
const QuotePdfEdit = lazy(() => import("./pages/QuotePdfEdit"));
const EmailQuote = lazy(() => import("./pages/EmailQuote"));
const CrmDashboard = lazy(() => import("./pages/CrmDashboard"));
const CrmLeadsList = lazy(() => import("./pages/CrmLeadsList"));
const CrmLeadDetail = lazy(() => import("./pages/CrmLeadDetail"));
const CrmReports = lazy(() => import("./pages/CrmReports"));
const CallLogs = lazy(() => import("./pages/CallLogs"));
const ProposalList = lazy(() => import("./pages/ProposalList"));
const ProposalEditor = lazy(() => import("./pages/ProposalEditor"));
const DesignAdvisorsAdmin = lazy(() => import("./pages/DesignAdvisorsAdmin"));
const ConstructionDashboard = lazy(() => import("./pages/ConstructionDashboard"));
const CheckMeasureWorkbook = lazy(() => import("./pages/CheckMeasureWorkbook"));
const ConstructionSchedule = lazy(() => import("./pages/ConstructionSchedule"));
const ConstructionProjectPlan = lazy(() => import("./pages/ConstructionProjectPlan"));
const ConstructionClients = lazy(() => import("./pages/ConstructionClients"));
const ConstructionClientDetail = lazy(() => import("./pages/ConstructionClientDetail"));
const ConstructionFinancial = lazy(() => import("./pages/ConstructionFinancial"));
const ConstructionAnalytics = lazy(() => import("./pages/ConstructionAnalytics"));
const ConstructionPurchaseOrders = lazy(() => import("./pages/ConstructionPurchaseOrders"));
const ConstructionCalendar = lazy(() => import("./pages/ConstructionCalendar"));
const LiveTracking = lazy(() => import("./pages/LiveTracking"));
const TeamChat = lazy(() => import("./pages/TeamChat"));
const BaCalendar = lazy(() => import("./pages/BaCalendar"));
const AdminTrades = lazy(() => import("./pages/AdminTrades"));
const AdminPeople = lazy(() => import("./pages/AdminPeople"));
const AdminEquipment = lazy(() => import("./pages/AdminEquipment"));
const AdminExtensions = lazy(() => import("./pages/AdminExtensions"));
const XeroSettings = lazy(() => import("./pages/XeroSettings"));
const XeroCallback = lazy(() => import("./pages/XeroCallback"));
const ImportHistoryLog = lazy(() => import("./pages/ImportHistoryLog"));

// Admin Sales Data sub-pages (lazy)
const StructureProducts = lazy(() => import("./pages/admin/StructureProducts"));
const StructureSpecMappings = lazy(() => import("./pages/admin/StructureSpecMappings"));
const ChecklistDefaults = lazy(() => import("./pages/admin/ChecklistDefaults"));
const StructureTabNames = lazy(() => import("./pages/admin/StructureTabNames"));
const StructureUom = lazy(() => import("./pages/admin/StructureUom"));
const StructureSubTabNames = lazy(() => import("./pages/admin/StructureSubTabNames"));
const DeckDataPage = lazy(() => import("./pages/admin/DeckDataPage"));
const EclipseDataPage = lazy(() => import("./pages/admin/EclipseDataPage"));
const PricingMarkup = lazy(() => import("./pages/admin/PricingMarkup"));
const PricingCouncilFee = lazy(() => import("./pages/admin/PricingCouncilFee"));
const PricingTravelBand = lazy(() => import("./pages/admin/PricingTravelBand"));
const PricingComplexity = lazy(() => import("./pages/admin/PricingComplexity"));
const PricingRegion = lazy(() => import("./pages/admin/PricingRegion"));
const PricingDelivery = lazy(() => import("./pages/admin/PricingDelivery"));
const PricingSmallJobSurcharge = lazy(() => import("./pages/admin/PricingSmallJobSurcharge"));
const PricingConstructionMgmt = lazy(() => import("./pages/admin/PricingConstructionMgmt"));
const PricingHomeWarranty = lazy(() => import("./pages/admin/PricingHomeWarranty"));
const GeneralColour = lazy(() => import("./pages/admin/GeneralColour"));
const ColourGroups = lazy(() => import("./pages/admin/ColourGroups"));
const GeneralNotification = lazy(() => import("./pages/admin/GeneralNotification"));
const NotificationLog = lazy(() => import("./pages/admin/NotificationLog"));
const GeneralThreshold = lazy(() => import("./pages/admin/GeneralThreshold"));
const DescriptionsOfWork = lazy(() => import("./pages/admin/DescriptionsOfWork"));
const SmsTemplates = lazy(() => import("./pages/admin/SmsTemplates"));
const ProposalLibrary = lazy(() => import("./pages/admin/ProposalLibrary"));
const SupplierCategoriesPage = lazy(() => import("./pages/admin/SupplierCategoriesPage"));
const AIRenderPricingSettings = lazy(() => import("./pages/admin/AIRenderPricingSettings"));
const AdminImageLibrary = lazy(() => import("./pages/AdminImageLibrary"));
const UserSettings = lazy(() => import("./pages/admin/UserSettings"));
const ColourPaletteSettings = lazy(() => import("./pages/admin/ColourPaletteSettings"));
const NavigationSettings = lazy(() => import("./pages/admin/NavigationSettings"));
const CompanySettings = lazy(() => import("./pages/admin/CompanySettings"));
const ClimboSettings = lazy(() => import("./pages/admin/ClimboSettings"));
const CrmDropdownOptions = lazy(() => import("./pages/admin/CrmDropdownOptions"));

// Inbox pages (lazy)
const InboxPage = lazy(() => import("./pages/InboxPage"));
const InboxThread = lazy(() => import("./pages/InboxThread"));
const InboxCompose = lazy(() => import("./pages/InboxCompose"));
const InboxAdminSettings = lazy(() => import("./pages/InboxAdminSettings"));

// Admin Portal Management (lazy)
const AdminPortalManagement = lazy(() => import("./pages/AdminPortalManagement"));
const AdminTradePortalContent = lazy(() => import("./pages/AdminTradePortalContent"));
const AdminInvoiceReview = lazy(() => import("./pages/AdminInvoiceReview"));
const ProjectPlanTemplates = lazy(() => import("./pages/ProjectPlanTemplates"));
const SubscriptionManagement = lazy(() => import("./pages/SubscriptionManagement"));
const SaasBillingAdmin = lazy(() => import("./pages/SaasBillingAdmin"));
const RenderCostDashboard = lazy(() => import("./pages/admin/RenderCostDashboard"));
const SubcontractEditor = lazy(() => import("./pages/SubcontractEditor"));
const HelpGuide = lazy(() => import("./pages/HelpGuide"));
const ProcessFlows = lazy(() => import("./pages/ProcessFlows"));
const ReportBug = lazy(() => import("./pages/ReportBug"));
const MakeSuggestion = lazy(() => import("./pages/MakeSuggestion"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const AdminSupportSubmissions = lazy(() => import("./pages/AdminSupportSubmissions"));
const TechLibraryAdmin = lazy(() => import("./pages/TechLibraryAdmin"));
const EnginiKnowledgeViewer = lazy(() => import("./pages/EnginiKnowledgeViewer"));
const AIProviderIntegration = lazy(() => import("./pages/admin/AIProviderIntegration"));
const AISettingsAdmin = lazy(() => import("./pages/AISettingsAdmin"));
const ApiHealthAdmin = lazy(() => import("./pages/ApiHealthAdmin"));
const WhsAdmin = lazy(() => import("./pages/WhsAdmin"));
const InductionFormAdmin = lazy(() => import("./pages/InductionFormAdmin"));
const SupplierDirectory = lazy(() => import("./pages/SupplierDirectory"));
const SupplierFeedback = lazy(() => import("./pages/SupplierFeedback"));
const PatioPlanner = lazy(() => import("./pages/PatioPlanner"));
const PlanConverter = lazy(() => import("./pages/PlanConverter"));
const PatioEditorPage = lazy(() => import("./pages/PatioEditorPage"));
const SmartshopOrderForm = lazy(() => import("./pages/SmartshopOrderForm"));
const OrderHistory = lazy(() => import("./pages/OrderHistory"));
const FlashingOrderList = lazy(() => import("./pages/FlashingOrderList"));
const FlashingOrderDetail = lazy(() => import("./pages/FlashingOrderDetail"));
const ComponentCatalogueAdmin = lazy(() => import("./pages/ComponentCatalogueAdmin"));
const ManufacturingDataAdmin = lazy(() => import("./pages/ManufacturingDataAdmin"));
const AdminSecurityScreens = lazy(() => import("./pages/admin/AdminSecurityScreens"));
const AdminBlinds = lazy(() => import("./pages/admin/AdminBlinds"));
const AdminTextBlocks = lazy(() => import("./pages/AdminTextBlocks"));
const TemplateManager = lazy(() => import("./pages/TemplateManager"));
const AdminChecklistPricing = lazy(() => import("./pages/AdminChecklistPricing"));
const WeatherHistory = lazy(() => import("./pages/WeatherHistory"));
const RainDays = lazy(() => import("./pages/RainDays"));
const TerritoryManagement = lazy(() => import("./pages/TerritoryManagement"));
const TerritoryCoverage = lazy(() => import("./pages/TerritoryCoverage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const CalendarAvailability = lazy(() => import("./pages/CalendarAvailability"));
const CalendarViewsAdmin = lazy(() => import("./pages/admin/CalendarViewsAdmin"));
const ConstructionChecklistTemplates = lazy(() => import("./pages/admin/ConstructionChecklistTemplates"));

// Approvals pages (lazy)
const ApprovalsDashboard = lazy(() => import("./pages/ApprovalsDashboard"));
const ApprovalsProjectList = lazy(() => import("./pages/ApprovalsProjectList"));
const ApprovalsProjectNew = lazy(() => import("./pages/ApprovalsProjectNew"));
const ApprovalsProjectDetail = lazy(() => import("./pages/ApprovalsProjectDetail"));
const ApprovalsPathwayAssessment = lazy(() => import("./pages/ApprovalsPathwayAssessment"));
const ApprovalsWorkflow = lazy(() => import("./pages/ApprovalsWorkflow"));
const ApprovalsWorkflowTemplates = lazy(() => import("./pages/ApprovalsWorkflowTemplates"));
const AdminHbcfBuilderProfile = lazy(() => import("./pages/AdminHbcfBuilderProfile"));
const ApprovalsAllTasks = lazy(() => import("./pages/ApprovalsAllTasks"));
const ApprovalsAllDocuments = lazy(() => import("./pages/ApprovalsAllDocuments"));
const ApprovalsAllRfis = lazy(() => import("./pages/ApprovalsAllRfis"));
const ApprovalsAllInspections = lazy(() => import("./pages/ApprovalsAllInspections"));

// Manufacturing pages (lazy)
const ManufacturingDashboard = lazy(() => import("./pages/ManufacturingDashboard"));
const ManufacturingOrders = lazy(() => import("./pages/ManufacturingOrders"));
const ManufacturingOrderDetail = lazy(() => import("./pages/ManufacturingOrderDetail"));
const ManufacturingCalendar = lazy(() => import("./pages/ManufacturingCalendar"));
const ManufacturingReports = lazy(() => import("./pages/ManufacturingReports"));
const ManufacturingPurchaseOrders = lazy(() => import("./pages/ManufacturingPurchaseOrders"));
const ManufacturingDispatch = lazy(() => import("./pages/ManufacturingDispatch"));
const ManufacturingDrivers = lazy(() => import("./pages/ManufacturingDrivers"));
const ManufacturingDeliveryCalendar = lazy(() => import("./pages/ManufacturingDeliveryCalendar"));
const ManufacturingQRCodes = lazy(() => import("./pages/ManufacturingQRCodes"));
const ManufacturingScanPage = lazy(() => import("./pages/ManufacturingScanPage"));
const ManufacturingKPI = lazy(() => import("./pages/ManufacturingKPI"));
const DriverMobileView = lazy(() => import("./pages/DriverMobileView"));

// Inventory pages (lazy)
const InventoryStockItems = lazy(() => import("./pages/InventoryStockItems"));
const InventoryMovements = lazy(() => import("./pages/InventoryMovements"));
const InventoryTransfers = lazy(() => import("./pages/InventoryTransfers"));
const InventoryReports = lazy(() => import("./pages/InventoryReports"));
const StocktakeList = lazy(() => import("./pages/StocktakeList"));
const StocktakeDetail = lazy(() => import("./pages/StocktakeDetail"));
const StocktakeMobileCount = lazy(() => import("./pages/StocktakeMobileCount"));
const LowStockAlerts = lazy(() => import("./pages/LowStockAlerts"));
const InventoryDashboard = lazy(() => import("./pages/InventoryDashboard"));
const WarehouseReceiving = lazy(() => import("./pages/WarehouseReceiving"));
const ProcurementWorkflow = lazy(() => import("./pages/ProcurementWorkflow"));

// DA Portal pages (lazy)
const DaDashboard = lazy(() => import("./pages/da-portal/DaDashboard"));
const DaPersonalDetails = lazy(() => import("./pages/da-portal/DaPersonalDetails"));
const DaCommissions = lazy(() => import("./pages/da-portal/DaCommissions"));
const DaInvoices = lazy(() => import("./pages/da-portal/DaInvoices"));
const DaPayments = lazy(() => import("./pages/da-portal/DaPayments"));
const DaNews = lazy(() => import("./pages/da-portal/DaNews"));
const AdminDaInvoiceApproval = lazy(() => import("./pages/AdminDaInvoiceApproval"));
const AdminDaCommissions = lazy(() => import("./pages/AdminDaCommissions"));
const AdminImpersonationLog = lazy(() => import("./pages/AdminImpersonationLog"));
const AdminColourScheme = lazy(() => import("./pages/AdminColourScheme"));
import DaPortalLayout from "./pages/da-portal/DaPortalLayout";

// Portal pages (lazy)
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalDocuments = lazy(() => import("./pages/portal/PortalDocuments"));
const PortalInvoices = lazy(() => import("./pages/portal/PortalInvoices"));
const PortalContacts = lazy(() => import("./pages/portal/PortalContacts"));
const PortalVariations = lazy(() => import("./pages/portal/PortalVariations"));
const PortalDefects = lazy(() => import("./pages/portal/PortalDefects"));
const PortalMaintenance = lazy(() => import("./pages/portal/PortalMaintenance"));
const PortalSubscription = lazy(() => import("./pages/portal/PortalSubscription"));
const PortalNews = lazy(() => import("./pages/portal/PortalNews"));
const PortalNewsArticle = lazy(() => import("./pages/portal/PortalNewsArticle"));
const PortalProducts = lazy(() => import("./pages/portal/PortalProducts"));
const PortalUpdates = lazy(() => import("./pages/portal/PortalUpdates"));
const PortalSettings = lazy(() => import("./pages/portal/PortalSettings"));
const PortalWhs = lazy(() => import("./pages/portal/PortalWhs"));
const PortalRenderGallery = lazy(() => import("./pages/portal/PortalRenderGallery"));
const PortalPlans = lazy(() => import("./pages/portal/PortalPlans"));

// Non-lazy portal imports (needed for layout/context)
import { PortalProvider } from "./contexts/PortalContext";
import PortalLayout from "./pages/portal/PortalLayout";

// Trade Portal pages (lazy)
const TradePortalLogin = lazy(() => import("./pages/trade-portal/TradePortalLogin"));
const TradePortalDashboard = lazy(() => import("./pages/trade-portal/TradePortalDashboard"));
const TradePortalSchedule = lazy(() => import("./pages/trade-portal/TradePortalSchedule"));
const TradePortalAvailability = lazy(() => import("./pages/trade-portal/TradePortalAvailability"));
const TradePortalContact = lazy(() => import("./pages/trade-portal/TradePortalContact"));
const TradePortalRemittances = lazy(() => import("./pages/trade-portal/TradePortalRemittances"));
const TradePortalInvoices = lazy(() => import("./pages/trade-portal/TradePortalInvoices"));
const TradePortalNews = lazy(() => import("./pages/trade-portal/TradePortalNews"));
const TradePortalNewsArticle = lazy(() => import("./pages/trade-portal/TradePortalNewsArticle"));
const TradePortalPhotos = lazy(() => import("./pages/trade-portal/TradePortalPhotos"));
const TradePortalMessages = lazy(() => import("./pages/trade-portal/TradePortalMessages"));
const TradePortalContracts = lazy(() => import("./pages/trade-portal/TradePortalContracts"));
const TradePortalWhs = lazy(() => import("./pages/trade-portal/TradePortalWhs"));
const TradePortalJobs = lazy(() => import("./pages/trade-portal/TradePortalJobs"));
const TradePortalInductions = lazy(() => import("./pages/trade-portal/TradePortalInductions"));
const TradePortalChat = lazy(() => import("./pages/trade-portal/TradePortalChat"));
const TradePortalFlashingOrders = lazy(() => import("./pages/trade-portal/TradePortalFlashingOrders"));
const TradePortalFlashingOrderDetail = lazy(() => import("./pages/trade-portal/TradePortalFlashingOrderDetail"));

// DA Tracker
const DaTrackerMap = lazy(() => import("./pages/DaTrackerMap"));
const DaTrackerList = lazy(() => import("./pages/DaTrackerList"));
const DaTrackerDetail = lazy(() => import("./pages/DaTrackerDetail"));
const DaTrackerSubscriptions = lazy(() => import("./pages/DaTrackerSubscriptions"));
const DaTrackerCompetitors = lazy(() => import("./pages/DaTrackerCompetitors"));
const NswDaTracker = lazy(() => import("./pages/NswDaTracker"));
const HbcfCertificates = lazy(() => import("./pages/HbcfCertificates"));
const HbcfDashboard = lazy(() => import("./pages/HbcfDashboard"));

// Non-lazy trade portal imports
import { TradePortalProvider } from "./contexts/TradePortalContext";
import TradePortalLayout from "./pages/trade-portal/TradePortalLayout";

function MasterDataPage({ children }: { children?: React.ReactNode }) {
  return (
    <AdminRoute>
      <MasterDataLayout>
        {children}
      </MasterDataLayout>
    </AdminRoute>
  );
}

function PortalRouter() {
  return (
    <PortalProvider>
      <PortalLayout>
        <ErrorBoundary inline>
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div>
              <p className="text-sm text-muted-foreground font-medium">Loading content...</p>
            </div>
          }>
        <Switch>
          <Route path="/portal/dashboard" component={PortalDashboard} />
          <Route path="/portal/updates" component={PortalUpdates} />
          <Route path="/portal/documents" component={PortalDocuments} />
          <Route path="/portal/invoices" component={PortalInvoices} />
          <Route path="/portal/contacts" component={PortalContacts} />
          <Route path="/portal/variations" component={PortalVariations} />
          <Route path="/portal/defects" component={PortalDefects} />
          <Route path="/portal/maintenance" component={PortalMaintenance} />
          <Route path="/portal/subscription" component={PortalSubscription} />
          <Route path="/portal/news/:slug" component={PortalNewsArticle} />
          <Route path="/portal/news" component={PortalNews} />
          <Route path="/portal/products" component={PortalProducts} />
          <Route path="/portal/renders" component={PortalRenderGallery} />
          <Route path="/portal/plans" component={PortalPlans} />
          <Route path="/portal/whs" component={PortalWhs} />
          <Route path="/portal/settings" component={PortalSettings} />
          <Route>{() => <Redirect to="/portal/dashboard" />}</Route>
        </Switch>
        </Suspense>
        </ErrorBoundary>
      </PortalLayout>
    </PortalProvider>
  );
}

function DaPortalRouter() {
  return (
    <DaPortalLayout>
      <ErrorBoundary inline>
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div>
            <p className="text-sm text-muted-foreground font-medium">Loading content...</p>
          </div>
        }>
          <Switch>
            <Route path="/da-portal" component={DaDashboard} />
            <Route path="/da-portal/personal-details" component={DaPersonalDetails} />
            <Route path="/da-portal/commissions" component={DaCommissions} />
            <Route path="/da-portal/invoices" component={DaInvoices} />
            <Route path="/da-portal/payments" component={DaPayments} />
            <Route path="/da-portal/news" component={DaNews} />
            <Route>{() => <Redirect to="/da-portal" />}</Route>
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </DaPortalLayout>
  );
}

function TradePortalRouter() {
  return (
    <TradePortalProvider>
      <TradePortalLayout>
        <ErrorBoundary inline>
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div>
              <p className="text-sm text-muted-foreground font-medium">Loading content...</p>
            </div>
          }>
        <Switch>
          <Route path="/trade-portal/dashboard" component={TradePortalDashboard} />
          <Route path="/trade-portal/schedule" component={TradePortalSchedule} />
          <Route path="/trade-portal/availability" component={TradePortalAvailability} />
          <Route path="/trade-portal/contact" component={TradePortalContact} />
          <Route path="/trade-portal/remittances" component={TradePortalRemittances} />
          <Route path="/trade-portal/invoices" component={TradePortalInvoices} />
          <Route path="/trade-portal/contracts" component={TradePortalContracts} />
          <Route path="/trade-portal/inductions" component={TradePortalInductions} />
          <Route path="/trade-portal/flashing-orders/:id" component={TradePortalFlashingOrderDetail} />
          <Route path="/trade-portal/flashing-orders" component={TradePortalFlashingOrders} />
          <Route path="/trade-portal/jobs/:jobId" component={TradePortalJobs} />
          <Route path="/trade-portal/jobs" component={TradePortalJobs} />
          <Route path="/trade-portal/whs" component={TradePortalWhs} />
          <Route path="/trade-portal/news/:slug" component={TradePortalNewsArticle} />
          <Route path="/trade-portal/news" component={TradePortalNews} />
          <Route path="/trade-portal/photos" component={TradePortalPhotos} />
          <Route path="/trade-portal/messages" component={TradePortalMessages} />
          <Route path="/trade-portal/chat" component={TradePortalChat} />
          <Route>{() => <Redirect to="/trade-portal/dashboard" />}</Route>
        </Switch>
        </Suspense>
        </ErrorBoundary>
      </TradePortalLayout>
    </TradePortalProvider>
  );
}

function MainRouter() {
  return (
    <DashboardLayout>
      <FloatingAIChat />
      <ErrorBoundary inline>
      <Suspense fallback={
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div>
            <p className="text-sm text-muted-foreground font-medium">Loading content...</p>
          </div>
        }>
      <RoutePermissionGuard>
      <Switch>
        <Route path="/" component={AppCentral} />
        <Route path="/sales" component={Home} />
        <Route path="/quotes" component={QuoteList} />
        <Route path="/quotes/:id">{(params) => <QuoteEditor id={Number(params.id)} />}</Route>
        <Route path="/quotes/:id/pdf-edit">{(params) => <QuotePdfEdit />}</Route>
        <Route path="/assistant" component={AssistantPage} />
        <Route path="/admin/master-data/structure/products">{() => <MasterDataPage><StructureProducts /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/structure/spec-mappings">{() => <MasterDataPage><StructureSpecMappings /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/structure/checklist-defaults">{() => <MasterDataPage><ChecklistDefaults /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/structure/tab-names">{() => <MasterDataPage><StructureTabNames /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/structure/sub-tab-names">{() => <MasterDataPage><StructureSubTabNames /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/structure/uom">{() => <MasterDataPage><StructureUom /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/deck">{() => <MasterDataPage><DeckDataPage /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/eclipse">{() => <MasterDataPage><EclipseDataPage /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/markup">{() => <MasterDataPage><PricingMarkup /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/council-fee">{() => <MasterDataPage><PricingCouncilFee /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/travel-band">{() => <MasterDataPage><PricingTravelBand /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/complexity">{() => <MasterDataPage><PricingComplexity /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/region">{() => <MasterDataPage><PricingRegion /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/delivery">{() => <MasterDataPage><PricingDelivery /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/small-job-surcharge">{() => <MasterDataPage><PricingSmallJobSurcharge /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/construction-mgmt">{() => <MasterDataPage><PricingConstructionMgmt /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/pricing/home-warranty">{() => <MasterDataPage><PricingHomeWarranty /></MasterDataPage>}</Route>
        <Route path="/admin/master-data/general/colour">{() => <AdminRoute><GeneralColour /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/colour-groups">{() => <AdminRoute><ColourGroups /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/colour-palette">{() => <AdminRoute><ColourPaletteSettings /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/notification">{() => <AdminRoute><GeneralNotification /></AdminRoute>}</Route>
        <Route path="/admin/notification-log">{() => <AdminRoute><NotificationLog /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/threshold">{() => <AdminRoute><GeneralThreshold /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/descriptions-of-work">{() => <AdminRoute><DescriptionsOfWork /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/sms-templates">{() => <AdminRoute><SmsTemplates /></AdminRoute>}</Route>
        <Route path="/admin/sales-content/proposal-library">{() => <AdminRoute><ProposalLibrary /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/supplier-categories">{() => <AdminRoute><SupplierCategoriesPage /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/image-library">{() => <AdminRoute><AdminImageLibrary /></AdminRoute>}</Route>
        <Route path="/admin/master-data/general/crm-dropdowns">{() => <AdminRoute><CrmDropdownOptions /></AdminRoute>}</Route>
        <Route path="/admin/master-data">{() => <Redirect to="/admin/master-data/structure/products" />}</Route>
        <Route path="/admin/ai-render-pricing">{() => <AdminRoute><AIRenderPricingSettings /></AdminRoute>}</Route>
        <Route path="/admin/company-settings">{() => <AdminRoute><CompanySettings /></AdminRoute>}</Route>
        <Route path="/admin/navigation-settings">{() => <AdminRoute><NavigationSettings /></AdminRoute>}</Route>
        <Route path="/admin/settings">{() => <AdminRoute><AdminSettings /></AdminRoute>}</Route>
        <Route path="/admin/climbo-settings">{() => <AdminRoute><ClimboSettings /></AdminRoute>}</Route>
        <Route path="/admin/section-templates">{() => <AdminRoute><AdminSectionTemplates /></AdminRoute>}</Route>
        <Route path="/admin/email-templates">{() => <AdminRoute><AdminEmailTemplates /></AdminRoute>}</Route>
        <Route path="/analytics" component={AnalyticsDashboard} />
        <Route path="/chat" component={TeamChat} />
        <Route path="/construction/jobs/:jobId/check-measure" component={CheckMeasureWorkbook} />
        <Route path="/construction/schedule" component={ConstructionSchedule} />
        <Route path="/construction/project-plan" component={ConstructionProjectPlan} />
        <Route path="/construction/clients/:id" component={ConstructionClientDetail} />
        <Route path="/construction/clients" component={ConstructionClients} />
        <Route path="/construction/ba-calendar">{() => { window.location.href = "/approvals"; return null; }}</Route>
        <Route path="/construction/financials" component={ConstructionFinancial} />
        <Route path="/admin/import-history">{() => <AdminRoute><ImportHistoryLog /></AdminRoute>}</Route>
        <Route path="/admin/eclipse-diagnostics">{() => <AdminRoute><EclipseQuoteDiagnostics /></AdminRoute>}</Route>
        <Route path="/construction/analytics" component={ConstructionAnalytics} />
        <Route path="/construction/weather-history" component={WeatherHistory} />
        <Route path="/construction/rain-days" component={RainDays} />
        <Route path="/construction/purchase-orders" component={ConstructionPurchaseOrders} />
        <Route path="/construction/live-tracking" component={LiveTracking} />
        <Route path="/construction/chat">{() => <Redirect to="/chat" />}</Route>
        {/* Calendar removed — consolidated into Work Schedule */}
        <Route path="/admin/people">{() => <AdminRoute><AdminPeople /></AdminRoute>}</Route>
        <Route path="/admin/trades">{() => <Redirect to="/admin/people" />}</Route>
        <Route path="/admin/equipment">{() => <AdminRoute><AdminEquipment /></AdminRoute>}</Route>
        <Route path="/admin/extensions">{() => <AdminRoute><AdminExtensions /></AdminRoute>}</Route>
        <Route path="/xero-settings" component={XeroSettings} />
        <Route path="/api/xero/callback" component={XeroCallback} />
        <Route path="/construction/component-orders/history" component={OrderHistory} />
        <Route path="/construction/component-orders" component={SmartshopOrderForm} />
        <Route path="/construction/flashing-orders/:id" component={FlashingOrderDetail} />
        <Route path="/construction/flashing-orders" component={FlashingOrderList} />
        <Route path="/construction/smartshop">{() => <Redirect to="/construction/component-orders" />}</Route>
        <Route path="/construction" component={ConstructionDashboard} />
        <Route path="/manufacturing/orders/:id" component={ManufacturingOrderDetail} />
        <Route path="/manufacturing/orders" component={ManufacturingOrders} />
        <Route path="/manufacturing/calendar" component={ManufacturingCalendar} />
        <Route path="/manufacturing/reports" component={ManufacturingReports} />
        <Route path="/manufacturing/purchase-orders" component={ManufacturingPurchaseOrders} />
        <Route path="/manufacturing/procurement" component={ProcurementWorkflow} />
        <Route path="/manufacturing/dispatch" component={ManufacturingDispatch} />
        <Route path="/manufacturing/drivers" component={ManufacturingDrivers} />
        <Route path="/manufacturing/delivery-calendar" component={ManufacturingDeliveryCalendar} />
        <Route path="/manufacturing/qr-codes" component={ManufacturingQRCodes} />
        <Route path="/manufacturing/kpi" component={ManufacturingKPI} />
        <Route path="/manufacturing" component={ManufacturingDashboard} />

        {/* Inventory */}
        <Route path="/inventory/dashboard" component={InventoryDashboard} />
        <Route path="/inventory/stock-items" component={InventoryStockItems} />
        <Route path="/inventory/movements" component={InventoryMovements} />
        <Route path="/inventory/transfers" component={InventoryTransfers} />
        <Route path="/inventory/reports" component={InventoryReports} />
        <Route path="/inventory/stocktake" component={StocktakeList} />
        <Route path="/inventory/stocktake/:id/count" component={StocktakeMobileCount} />
        <Route path="/inventory/stocktake/:id" component={StocktakeDetail} />
        <Route path="/manufacturing/stocktake">{() => <Redirect to="/inventory/stocktake" />}</Route>
        <Route path="/manufacturing/stocktake/:id/count">{(params) => <Redirect to={`/inventory/stocktake/${params.id}/count`} />}</Route>
        <Route path="/manufacturing/stocktake/:id">{(params) => <Redirect to={`/inventory/stocktake/${params.id}`} />}</Route>
        <Route path="/inventory/warehouse-receiving" component={WarehouseReceiving} />
        <Route path="/inventory/low-stock-alerts" component={LowStockAlerts} />
        <Route path="/deck-quotes" component={DeckQuoteList} />
        <Route path="/deck-quotes/:id" component={DeckQuoteEditor} />
        <Route path="/eclipse-quotes" component={EclipseQuoteList} />
        <Route path="/eclipse-quotes/:id">{(params) => <EclipseQuoteEditor id={Number(params.id)} />}</Route>
        <Route path="/security-screens/quote/:id" component={SecurityScreenQuote} />
        <Route path="/security-screens" component={SecurityScreenQuote} />
        <Route path="/blinds/quote/:id" component={BlindsQuote} />
        <Route path="/blinds" component={BlindsQuote} />
        <Route path="/proposals" component={ProposalList} />
        <Route path="/proposals/new" component={ProposalEditor} />
        <Route path="/proposals/edit/:id" component={ProposalEditor} />
        <Route path="/crm/leads/:leadId/preview" component={QuotePreview} />
        <Route path="/crm/leads/:leadId/email" component={EmailQuote} />
        <Route path="/crm" component={CrmDashboard} />
        <Route path="/crm/leads" component={CrmLeadsList} />
        <Route path="/crm/leads/:id" component={CrmLeadDetail} />
        <Route path="/calls" component={CallLogs} />
        <Route path="/admin/design-advisors">{() => <AdminRoute><DesignAdvisorsAdmin /></AdminRoute>}</Route>
        <Route path="/admin/user-settings">{() => <Redirect to="/admin/people" />}</Route>
        <Route path="/admin/portal-management">{() => <AdminRoute><AdminPortalManagement /></AdminRoute>}</Route>
        <Route path="/admin/trade-portal-content">{() => <AdminRoute><AdminTradePortalContent /></AdminRoute>}</Route>
        <Route path="/admin/territories">{() => <AdminRoute><TerritoryManagement /></AdminRoute>}</Route>
        <Route path="/admin/territory-coverage">{() => <AdminRoute><TerritoryCoverage /></AdminRoute>}</Route>
        <Route path="/admin/da-invoices">{() => <AdminRoute><AdminDaInvoiceApproval /></AdminRoute>}</Route>
        <Route path="/admin/da-commissions">{() => <AdminRoute><AdminDaCommissions /></AdminRoute>}</Route>
        <Route path="/admin/invoice-review">{() => <AdminRoute><AdminInvoiceReview /></AdminRoute>}</Route>
        <Route path="/admin/project-plan-templates">{() => <AdminRoute><ProjectPlanTemplates /></AdminRoute>}</Route>
        <Route path="/admin/subscriptions">{() => <AdminRoute><SubscriptionManagement /></AdminRoute>}</Route>
        <Route path="/admin/saas-billing">{() => <AdminRoute><SaasBillingAdmin /></AdminRoute>}</Route>
        <Route path="/admin/render-costs">{() => <AdminRoute><RenderCostDashboard /></AdminRoute>}</Route>
        <Route path="/admin/inbox-settings">{() => <AdminRoute><InboxAdminSettings /></AdminRoute>}</Route>
        <Route path="/admin/tech-library">{() => <AdminRoute><TechLibraryAdmin /></AdminRoute>}</Route>
        <Route path="/admin/engini-knowledge">{() => <AdminRoute><EnginiKnowledgeViewer /></AdminRoute>}</Route>
        <Route path="/admin/ai-provider">{() => <AdminRoute><AIProviderIntegration /></AdminRoute>}</Route>
        <Route path="/admin/ai-settings">{() => <AdminRoute><AISettingsAdmin /></AdminRoute>}</Route>
        <Route path="/admin/api-health">{() => <AdminRoute><ApiHealthAdmin /></AdminRoute>}</Route>
        <Route path="/admin/whs">{() => <AdminRoute><WhsAdmin /></AdminRoute>}</Route>
        <Route path="/admin/induction-config">{() => <AdminRoute><InductionFormAdmin /></AdminRoute>}</Route>
        <Route path="/admin/suppliers">{() => <AdminRoute><SupplierDirectory supplierScope="construction" /></AdminRoute>}</Route>
        <Route path="/manufacturing/suppliers">{() => <AdminRoute><SupplierDirectory supplierScope="manufacturing" /></AdminRoute>}</Route>
        <Route path="/admin/supplier-feedback">{() => <AdminRoute><SupplierFeedback /></AdminRoute>}</Route>
        <Route path="/admin/component-catalogue">{() => <AdminRoute><ComponentCatalogueAdmin /></AdminRoute>}</Route>
        <Route path="/admin/manufacturing-data">{() => <AdminRoute><ManufacturingDataAdmin /></AdminRoute>}</Route>
        <Route path="/admin/security-screens">{() => <MasterDataPage><AdminSecurityScreens /></MasterDataPage>}</Route>
        <Route path="/admin/blinds">{() => <MasterDataPage><AdminBlinds /></MasterDataPage>}</Route>
        <Route path="/admin/text-blocks">{() => <AdminRoute><AdminTextBlocks /></AdminRoute>}</Route>
        <Route path="/admin/order-templates">{() => <AdminRoute><TemplateManager /></AdminRoute>}</Route>
        <Route path="/admin/construction-checklist-templates">{() => <AdminRoute><ConstructionChecklistTemplates /></AdminRoute>}</Route>
        <Route path="/admin/checklist-pricing">{() => <AdminRoute><AdminChecklistPricing /></AdminRoute>}</Route>
        <Route path="/admin/impersonation-log">{() => <AdminRoute><AdminImpersonationLog /></AdminRoute>}</Route>
        <Route path="/admin/calendar-views">{() => <AdminRoute><CalendarViewsAdmin /></AdminRoute>}</Route>
        <Route path="/admin/support-submissions">{() => <AdminRoute><AdminSupportSubmissions /></AdminRoute>}</Route>
        <Route path="/admin/colour-scheme">{() => <AdminRoute><AdminColourScheme /></AdminRoute>}</Route>
        <Route path="/subcontracts/:id">{() => <SubcontractEditor />}</Route>
        <Route path="/patio-planner/:id" component={PatioEditorPage} />
        <Route path="/patio-planner" component={PatioPlanner} />
        <Route path="/plan-converter" component={PlanConverter} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/calendar-availability" component={CalendarAvailability} />
        <Route path="/help" component={HelpGuide} />
        <Route path="/process-flows" component={ProcessFlows} />
        <Route path="/support/bug" component={ReportBug} />
        <Route path="/support/suggestion" component={MakeSuggestion} />
        <Route path="/invite/:token">{(params) => <AcceptInvitation token={params.token!} />}</Route>
        {/* Approvals */}
        <Route path="/approvals/tasks" component={ApprovalsAllTasks} />
        <Route path="/approvals/documents" component={ApprovalsAllDocuments} />
        <Route path="/approvals/rfis" component={ApprovalsAllRfis} />
        <Route path="/approvals/inspections" component={ApprovalsAllInspections} />
        <Route path="/approvals/workflow-templates" component={ApprovalsWorkflowTemplates} />
        <Route path="/approvals/hbcf/dashboard" component={HbcfDashboard} />
        <Route path="/approvals/hbcf/certificates" component={HbcfCertificates} />
        <Route path="/approvals/hbcf/competitors">{() => <DaTrackerCompetitors initialBranch="hbcf" />}</Route>
        <Route path="/approvals/hbcf/builder-profile">{() => <AdminRoute><AdminHbcfBuilderProfile /></AdminRoute>}</Route>
        <Route path="/approvals/hbcf-builder-profile">{() => <AdminRoute><AdminHbcfBuilderProfile /></AdminRoute>}</Route>
        <Route path="/approvals/projects/new" component={ApprovalsProjectNew} />
        <Route path="/approvals/projects/:id/pathway" component={ApprovalsPathwayAssessment} />
        <Route path="/approvals/projects/:id/workflow" component={ApprovalsWorkflow} />
        <Route path="/approvals/projects/:id">{(params) => <ApprovalsProjectDetail />}</Route>
        <Route path="/approvals/projects" component={ApprovalsProjectList} />
        <Route path="/approvals" component={ApprovalsDashboard} />

        <Route path="/da-tracker/nsw" component={NswDaTracker} />
        <Route path="/da-tracker/competitors">{() => <DaTrackerCompetitors />}</Route>
        <Route path="/da-tracker/subscriptions" component={DaTrackerSubscriptions} />
        <Route path="/da-tracker/list" component={DaTrackerList} />
        <Route path="/da-tracker/:id">{() => <DaTrackerDetail />}</Route>
        <Route path="/da-tracker" component={DaTrackerMap} />

        <Route path="/inbox/compose" component={InboxCompose} />
        <Route path="/inbox/thread/message/:messageId">{(params) => <InboxThread messageId={Number(params.messageId)} />}</Route>
        <Route path="/inbox/thread/:threadId">{(params) => <InboxThread threadId={params.threadId!} />}</Route>
        <Route path="/inbox" component={InboxPage} />
        <Route path="/crm/reports" component={CrmReports} />
        <Route component={NotFound} />
      </Switch>
      </RoutePermissionGuard>
      </Suspense>
      </ErrorBoundary>
    </DashboardLayout>
  );
}

function RoutePermissionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { canAccessPath, loading: permissionsLoading } = useEffectivePermissions();
  const allowed = !user || canAccessPath(location);

  useEffect(() => {
    if (authLoading || permissionsLoading || !user || allowed) return;
    setLocation("/");
  }, [allowed, authLoading, location, permissionsLoading, setLocation, user]);

  if (authLoading || permissionsLoading) return null;
  if (user && !allowed) return null;

  return <>{children}</>;
}

function App() {
  const [location] = useLocation();
  useFavicon();
  useInstallSurfaceMetadata(location);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <ImpersonationBanner />
          <Toaster richColors position="top-right" />
          <Switch>
            <Route path="/portal/login">{() => <PortalProvider><Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div>
                <p className="text-sm text-muted-foreground font-medium">Loading...</p>
              </div>
            }><PortalLogin /></Suspense></PortalProvider>}</Route>
            <Route path="/portal">{() => {
              // Redirect /portal?token=... to /portal/login?token=...
              const search = window.location.search;
              window.location.replace(`/portal/login${search}`);
              return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div></div>;
            }}</Route>
            <Route path="/portal/*" component={PortalRouter} />
            <Route path="/trade-portal/login">{() => <TradePortalProvider><Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div>
                <p className="text-sm text-muted-foreground font-medium">Loading...</p>
              </div>
            }><TradePortalLogin /></Suspense></TradePortalProvider>}</Route>
            <Route path="/trade-portal">{() => {
              const search = window.location.search;
              window.location.replace(`/trade-portal/login${search}`);
              return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div></div>;
            }}</Route>
            <Route path="/trade-portal/*" component={TradePortalRouter} />
            <Route path="/da-portal" component={DaPortalRouter} />
            <Route path="/da-portal/*" component={DaPortalRouter} />
            <Route path="/scan/:token">{(params) => <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div></div>}><ManufacturingScanPage /></Suspense>}</Route>
            <Route path="/driver/:token">{(params) => <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-3 border-muted border-t-foreground"></div></div>}><DriverMobileView /></Suspense>}</Route>
            <Route component={MainRouter} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
