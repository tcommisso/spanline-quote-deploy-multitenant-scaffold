import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PenLine, CheckCircle2, XCircle, Clock, AlertTriangle, Download, Bell, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

interface SignatureStatusBadgeProps {
  quoteId: number;
  compact?: boolean;
}

export default function SignatureStatusBadge({ quoteId, compact }: SignatureStatusBadgeProps) {
  const { data, isLoading, refetch } = trpc.signwell.getStatus.useQuery({ quoteId });
  const downloadMutation = trpc.signwell.downloadSignedPdf.useMutation();
  const reminderMutation = trpc.signwell.sendReminder.useMutation();
  const [downloading, setDownloading] = useState(false);

  if (isLoading || !data?.status) return null;

  const status = data.status;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (data.signedPdfUrl) {
        window.open(data.signedPdfUrl, "_blank");
      } else {
        const result = await downloadMutation.mutateAsync({ quoteId });
        if (result.url) {
          window.open(result.url, "_blank");
          refetch();
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to download signed PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handleReminder = async () => {
    try {
      await reminderMutation.mutateAsync({ quoteId });
      toast.success("Signing reminder sent");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reminder");
    }
  };

  const statusConfig: Record<string, { icon: any; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { icon: Clock, label: "Awaiting Signature", variant: "secondary" },
    completed: { icon: CheckCircle2, label: "Signed", variant: "default" },
    declined: { icon: XCircle, label: "Declined", variant: "destructive" },
    expired: { icon: AlertTriangle, label: "Expired", variant: "outline" },
    cancelled: { icon: XCircle, label: "Cancelled", variant: "outline" },
  };

  const config = statusConfig[status] || { icon: PenLine, label: status, variant: "outline" as const };
  const Icon = config.icon;

  if (compact) {
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>

      {status === "pending" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={handleReminder}
          disabled={reminderMutation.isPending}
        >
          <Bell className="h-3 w-3" />
          Remind
        </Button>
      )}

      {status === "completed" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Signed PDF
        </Button>
      )}

      {data.sentAt && (
        <span className="text-xs text-muted-foreground">
          Sent {new Date(data.sentAt).toLocaleDateString()}
        </span>
      )}

      {data.completedAt && (
        <span className="text-xs text-muted-foreground">
          Signed {new Date(data.completedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
