import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Sparkles, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface SendProposalDialogProps {
  quoteId: number;
  clientName: string;
  clientEmail?: string;
  quoteNumber: string;
  onGeneratePdf: () => Promise<string | undefined>;
  disabled?: boolean;
  /** Called after successful send — use to mark proposal as sent */
  onSent?: (sentTo: string) => void;
}

export default function SendProposalDialog({
  quoteId,
  clientName,
  clientEmail,
  quoteNumber,
  onGeneratePdf,
  disabled,
  onSent,
}: SendProposalDialogProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(clientEmail || "");
  const [subject, setSubject] = useState(`Your Proposal - Quote ${quoteNumber}`);
  const [coverMessage, setCoverMessage] = useState(
    `Hi ${clientName},\n\nPlease find attached your proposal for the project we discussed. If you have any questions or would like to proceed, please don't hesitate to get in touch.\n\nKind regards`
  );
  const [sending, setSending] = useState(false);
  const [attachRender, setAttachRender] = useState(false);
  const [selectedRenderUrl, setSelectedRenderUrl] = useState<string | null>(null);

  // Fetch available renders for this quote
  const { data: renderData } = trpc.patioRender.getLatestRenderForQuote.useQuery(
    { quoteId },
    { enabled: open }
  );

  // Auto-select latest render when data loads
  useEffect(() => {
    if (renderData?.hasRender && renderData.renders.length > 0) {
      setSelectedRenderUrl(renderData.renders[0].imageUrl);
      setAttachRender(true);
    }
  }, [renderData]);

  const sendMutation = trpc.email.sendProposal.useMutation();

  const handleSend = async () => {
    if (!to) {
      toast.error("Please enter a recipient email address");
      return;
    }
    setSending(true);
    try {
      // Generate PDF as base64
      const pdfBase64 = await onGeneratePdf();
      if (!pdfBase64) {
        toast.error("Failed to generate PDF for email");
        return;
      }

      const result = await sendMutation.mutateAsync({
        quoteId,
        to,
        subject,
        coverMessage,
        pdfBase64,
        renderImageUrl: attachRender && selectedRenderUrl ? selectedRenderUrl : undefined,
      });

      if (result.success) {
        toast.success(`Proposal sent to ${to}`);
        onSent?.(to);
        setOpen(false);
      } else {
        toast.error(result.error || "Failed to send email");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
          <Send className="h-3.5 w-3.5" />
          Send to Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Proposal to Client</DialogTitle>
          <DialogDescription>
            Email the proposal PDF directly to {clientName}. The PDF will be generated and attached automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="email-to">Recipient Email</Label>
            <Input
              id="email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-message">Cover Message</Label>
            <Textarea
              id="email-message"
              value={coverMessage}
              onChange={(e) => setCoverMessage(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>

          {/* AI Render Attachment Section */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <Label className="text-sm font-medium cursor-pointer">Attach AI Render</Label>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachRender}
                  onChange={(e) => setAttachRender(e.target.checked)}
                  disabled={!renderData?.hasRender}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-purple-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
              </label>
            </div>

            {!renderData?.hasRender && (
              <p className="text-[10px] text-muted-foreground italic">
                No AI renders available. Create a Patio Planner project linked to this quote and generate a render first.
              </p>
            )}

            {renderData?.hasRender && attachRender && (
              <div className="space-y-2">
                <select
                  className="w-full text-xs border rounded px-2 py-1.5 bg-background"
                  value={selectedRenderUrl || ""}
                  onChange={(e) => setSelectedRenderUrl(e.target.value)}
                >
                  {renderData.renders.map((r, i) => (
                    <option key={r.id} value={r.imageUrl}>
                      Render {renderData.renders.length - i} — {r.promptMode === "full" ? "Full" : "Quick"} ({new Date(r.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })})
                    </option>
                  ))}
                </select>

                {selectedRenderUrl && (
                  <div className="relative rounded-md overflow-hidden border bg-muted/30">
                    <img
                      src={selectedRenderUrl}
                      alt="AI Render preview"
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ImageIcon className="h-2.5 w-2.5" />
                      Link included in email
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !to} className="gap-2">
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
