import { useState } from "react";
import { usePortal } from "@/contexts/PortalContext";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, DollarSign, Users, AlertTriangle, Wrench,
  ClipboardList, Newspaper, ShoppingBag, CheckCircle2
} from "lucide-react";
import { OnboardingTour, TourHelpButton, isTourCompleted } from "@/components/OnboardingTour";
import { clientPortalTour, TOUR_IDS } from "@/lib/tours";
import PortalApprovalTimeline from "@/components/portal/PortalApprovalTimeline";
import { isConstructionChecklistDisplayResponseType } from "@shared/construction-checklist-templates";

export default function PortalDashboard() {
  const { user, isLoading: authLoading } = usePortal();
  const statusQuery = trpc.portal.getProjectStatus.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });
  const checklistQuery = trpc.portal.getVisibleChecklistItems.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });
  const [tourActive, setTourActive] = useState(!isTourCompleted(TOUR_IDS.clientPortal));
  const checklistItems = checklistQuery.data || [];
  const checklistActionCount = checklistItems.filter((item: any) => !isConstructionChecklistDisplayResponseType(String(item.responseType || "check"))).length;

  // Show loading skeleton while auth is resolving
  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  // If user is null after loading completes, the layout will redirect to login
  // But render a minimal fallback just in case
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;

  return (
    <div className="space-y-6">
      <OnboardingTour
        tourId={TOUR_IDS.clientPortal}
        steps={clientPortalTour}
        active={tourActive}
        onComplete={() => setTourActive(false)}
      />

      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Welcome, {user.clientName}</h1>
          <p className="text-sm text-muted-foreground">Here's an overview of your project</p>
        </div>
        <TourHelpButton onClick={() => setTourActive(true)} label="Tour" />
      </div>

      {/* Project Status Card */}
      {statusQuery.isLoading ? (
        <Skeleton className="h-32 w-full" data-tour="portal-status" />
      ) : status ? (
        <Card data-tour="portal-status">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Project Status</p>
                <Badge variant={status.status === "completed" ? "default" : "secondary"} className="mt-1">
                  {status.status?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </Badge>
              </div>
              {status.quoteNumber && (
                <p className="text-sm text-muted-foreground">Ref: {status.quoteNumber}</p>
              )}
            </div>
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span>{status.completedStages}/{status.totalStages} stages</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className="bg-primary rounded-full h-3 transition-all"
                  style={{ width: `${status.totalStages > 0 ? (status.completedStages / status.totalStages) * 100 : 0}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : statusQuery.isError ? (
        <Card data-tour="portal-status">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Project status is being updated. Check back soon.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Approval Timeline */}
      <PortalApprovalTimeline />

      {checklistItems.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Project Checklist</p>
                <p className="text-xs text-muted-foreground">Items shared by your construction team</p>
              </div>
              <Badge variant="secondary">{checklistActionCount}</Badge>
            </div>
            <div className="space-y-2">
              {checklistItems.slice(0, 7).map((item: any) => {
                const responseType = String(item.responseType || "check");
                if (responseType === "divider") {
                  return <div key={item.id} className="border-t" />;
                }
                if (responseType === "section_header") {
                  return (
                    <div key={item.id} className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                    </div>
                  );
                }
                return (
                  <div key={item.id} className="flex items-start gap-2 rounded-md border p-3">
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${item.status === "done" ? "text-green-600" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{String(item.status || "open").replace(/_/g, " ")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4" data-tour="portal-nav">
        <Link href="/portal/documents">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full" data-tour="portal-documents">
            <CardContent className="pt-6 text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="font-medium text-sm">Documents</p>
              <p className="text-xs text-muted-foreground">Contracts & plans</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/invoices">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <p className="font-medium text-sm">Invoices</p>
              <p className="text-xs text-muted-foreground">Payments & history</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/contacts">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-600" />
              <p className="font-medium text-sm">Contacts</p>
              <p className="text-xs text-muted-foreground">Your project team</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/variations">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 text-orange-600" />
              <p className="font-medium text-sm">Variations</p>
              <p className="text-xs text-muted-foreground">Changes & approvals</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/defects">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full" data-tour="portal-defects">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="font-medium text-sm">Defects</p>
              <p className="text-xs text-muted-foreground">Report & track issues</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/maintenance">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <Wrench className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">Maintenance</p>
              <p className="text-xs text-muted-foreground">Request service</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/subscription">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="font-medium text-sm">Care Plans</p>
              <p className="text-xs text-muted-foreground">CPC subscription</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/news">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <Newspaper className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="font-medium text-sm">News</p>
              <p className="text-xs text-muted-foreground">Updates & offers</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/products">
          <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="pt-6 text-center">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-rose-600" />
              <p className="font-medium text-sm">Products</p>
              <p className="text-xs text-muted-foreground">Additional services</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
