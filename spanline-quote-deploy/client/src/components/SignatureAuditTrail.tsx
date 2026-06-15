import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Eye, CheckCircle2, XCircle, Clock, Bell, FileText } from "lucide-react";

const EVENT_CONFIG: Record<string, { label: string; icon: any; color: string; badgeClass: string }> = {
  sent: { label: "Sent for Signature", icon: Send, color: "text-blue-600", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  viewed: { label: "Document Viewed", icon: Eye, color: "text-purple-600", badgeClass: "bg-purple-50 text-purple-700 border-purple-200" },
  signed: { label: "Document Signed", icon: CheckCircle2, color: "text-green-600", badgeClass: "bg-green-50 text-green-700 border-green-200" },
  declined: { label: "Document Declined", icon: XCircle, color: "text-red-600", badgeClass: "bg-red-50 text-red-700 border-red-200" },
  expired: { label: "Document Expired", icon: Clock, color: "text-amber-600", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  reminder_sent: { label: "Reminder Sent", icon: Bell, color: "text-indigo-600", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

interface SignatureAuditTrailProps {
  quoteId: number;
}

export default function SignatureAuditTrail({ quoteId }: SignatureAuditTrailProps) {
  const { data: auditLogs, isLoading } = trpc.signwell.getAuditTrail.useQuery({ quoteId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Signature History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Signature History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No signature events yet. Send the proposal for signature to start tracking.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Signature History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-4">
            {auditLogs.map((log) => {
              const config = EVENT_CONFIG[log.event] || { label: log.event, icon: FileText, color: "text-muted-foreground", badgeClass: "bg-muted text-muted-foreground" };
              const Icon = config.icon;
              return (
                <div key={log.id} className="relative flex items-start gap-3 pl-1">
                  {/* Timeline dot */}
                  <div className={`relative z-10 h-8 w-8 rounded-full bg-background border-2 flex items-center justify-center shrink-0 ${config.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${config.badgeClass}`}>
                        {config.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.recipientEmail && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {log.recipientName ? `${log.recipientName} (${log.recipientEmail})` : log.recipientEmail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
