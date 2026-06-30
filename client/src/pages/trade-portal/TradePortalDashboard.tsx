import { useState } from "react";
import { useTradePortal } from "@/contexts/TradePortalContext";
import { trpc } from "@/lib/trpc";
import { OnboardingTour, TourHelpButton, isTourCompleted } from "@/components/OnboardingTour";
import { tradePortalTour, TOUR_IDS } from "@/lib/tours";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Briefcase, CalendarDays, MessageSquare, FileUp, MapPin, Clock } from "lucide-react";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-primary/10 text-primary",
  on_hold: "bg-orange-100 text-orange-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  confirmed: "bg-emerald-100 text-emerald-800",
};

export default function TradePortalDashboard() {
  const { user } = useTradePortal();
  const { data, isLoading } = trpc.tradePortal.dashboard.useQuery();
  const [tourActive, setTourActive] = useState(!isTourCompleted(TOUR_IDS.tradePortal));

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 sm:h-28" />)}
        </div>
        <Skeleton className="h-48 sm:h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <OnboardingTour
        tourId={TOUR_IDS.tradePortal}
        steps={tradePortalTour}
        active={tourActive}
        onComplete={() => setTourActive(false)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            Welcome, {user?.installerName}
          </h1>
          <p className="text-sm text-muted-foreground">Here's an overview of your current work</p>
        </div>
        <TourHelpButton onClick={() => setTourActive(true)} label="Tour" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4" data-tour="trade-kpis">
        <Card className="border-primary/20">
          <CardContent className="p-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg shrink-0">
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{data?.activeJobs.length || 0}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground">Active Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg shrink-0">
                <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{data?.upcomingEvents.length || 0}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground">Upcoming (14d)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Link href="/trade-portal/messages">
          <Card className="border-purple-200 cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg shrink-0">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold">{data?.unreadMessages || 0}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">Unread Msgs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/trade-portal/invoices">
          <Card className="border-green-200 cursor-pointer hover:shadow-md transition-shadow h-full">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg shrink-0">
                  <FileUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold">{data?.pendingInvoices || 0}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">Pending Inv.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Upcoming Events */}
      <Card data-tour="trade-schedule">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Upcoming Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {data?.upcomingEvents && data.upcomingEvents.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {data.upcomingEvents.map((event) => (
                <div key={event.eventId} className="flex items-start gap-3 sm:gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="text-center min-w-[44px] sm:min-w-[50px]">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {new Date(event.startTime).toLocaleDateString("en-AU", { weekday: "short" })}
                    </p>
                    <p className="text-base sm:text-lg font-bold">
                      {new Date(event.startTime).getDate()}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {new Date(event.startTime).toLocaleDateString("en-AU", { month: "short" })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{event.eventTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">{event.clientName} — {event.quoteNumber}</p>
                    {event.siteAddress && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{event.siteAddress}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={`text-[10px] sm:text-xs ${statusColors[event.eventStatus] || "bg-gray-100 text-gray-800"}`}>
                      {event.eventStatus.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(event.startTime).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6 sm:py-8">No upcoming events in the next 14 days</p>
          )}
        </CardContent>
      </Card>

      {/* Active Jobs */}
      <Card data-tour="trade-jobs">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Active Jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {data?.activeJobs && data.activeJobs.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {data.activeJobs.map((job) => (
                <div key={job.jobId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-muted/50 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{job.clientName}</p>
                    <p className="text-xs text-muted-foreground">{job.quoteNumber}</p>
                    {job.siteAddress && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{job.siteAddress}</span>
                      </p>
                    )}
                    {job.subcontracts && (
                      <p className="text-xs mt-1 text-green-700">
                        {job.subcontracts.readyCount}/{job.subcontracts.count} contract{job.subcontracts.count > 1 ? "s" : ""} ready
                        {job.subcontracts.totalValue > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            (${job.subcontracts.totalValue.toLocaleString("en-AU", { minimumFractionDigits: 0 })})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <Badge className={`self-start sm:self-center shrink-0 ${statusColors[job.jobStatus || ""] || "bg-gray-100 text-gray-800"}`}>
                    {(job.jobStatus || "").replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6 sm:py-8">No active jobs</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
