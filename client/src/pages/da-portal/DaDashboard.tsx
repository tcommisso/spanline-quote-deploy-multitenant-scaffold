import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileUp, Clock, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export default function DaDashboard() {
  const { data: summary, isLoading } = trpc.daPortal.getDashboardSummary.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-16 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      title: "Unclaimed Balance",
      value: `$${parseFloat(summary?.totalUnclaimedBalance || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      href: "/da-portal/commissions",
      color: "text-green-600",
    },
    {
      title: "Active Commissions",
      value: summary?.activeCommissions || 0,
      icon: TrendingUp,
      href: "/da-portal/commissions",
      color: "text-blue-600",
    },
    {
      title: "Pending Invoices",
      value: summary?.pendingInvoices || 0,
      icon: FileUp,
      href: "/da-portal/invoices",
      color: "text-orange-600",
    },
    {
      title: "Total Jobs",
      value: summary?.totalCommissions || 0,
      icon: Clock,
      href: "/da-portal/commissions",
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/da-portal/invoices">
              <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent cursor-pointer">
                <FileUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Submit New Invoice</span>
              </div>
            </Link>
            <Link href="/da-portal/personal-details">
              <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent cursor-pointer">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Update Bank Details</span>
              </div>
            </Link>
            <Link href="/da-portal/commissions">
              <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent cursor-pointer">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">View Commission Statement</span>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Commission Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Commission is paid 75% after deposit received and contract signed, 
              and 25% (or adjusted amount) after completion at admin discretion.
            </p>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Unclaimed:</span>
                <span className="font-medium">${parseFloat(summary?.totalUnclaimedBalance || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Jobs:</span>
                <span className="font-medium">{summary?.activeCommissions || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
