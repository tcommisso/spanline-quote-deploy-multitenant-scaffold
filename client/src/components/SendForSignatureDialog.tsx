import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PenLine, Loader2, ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface SendForSignatureDialogProps {
  quoteId: number;
  clientName: string;
  clientEmail?: string;
  quoteNumber: string;
  /** Should return { pdfBase64, totalPages, signatureY } or undefined on failure */
  onGeneratePdf: () => Promise<{ pdfBase64: string; totalPages: number; signatureY?: number } | undefined>;
  disabled?: boolean;
  /** Called after successful signature send — use to mark proposal as sent */
  onSent?: (sentTo: string) => void;
}

export default function SendForSignatureDialog({
  quoteId,
  clientName,
  clientEmail,
  quoteNumber,
  onGeneratePdf,
  disabled,
  onSent,
}: SendForSignatureDialogProps) {
  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState(clientName || "");
  const [recipientEmail, setRecipientEmail] = useState(clientEmail || "");
  const [subject, setSubject] = useState(`Your Altaspan Proposal - ${quoteNumber}`);
  const [message, setMessage] = useState(
    `Please review and sign the attached proposal for your Altaspan project. If you have any questions, please don't hesitate to contact us.`
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

  // Reset fields when dialog opens (in case client data changed)
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setRecipientName(clientName || "");
      setRecipientEmail(clientEmail || "");
      setSubject(`Your Altaspan Proposal - ${quoteNumber}`);
    }
    setOpen(isOpen);
  };

  const sendMutation = trpc.signwell.sendForSignature.useMutation();

  const handleSend = async () => {
    if (!recipientEmail) {
      toast.error("Please enter a recipient email address");
      return;
    }
    if (!recipientName) {
      toast.error("Please enter the recipient's name");
      return;
    }
    setSending(true);
    try {
      // Generate PDF as base64 with page count
      const result = await onGeneratePdf();
      if (!result) {
        toast.error("Failed to generate PDF for signature");
        return;
      }

      const { pdfBase64, totalPages, signatureY } = result;

      const sendResult = await sendMutation.mutateAsync({
        quoteId,
        recipientName,
        recipientEmail,
        pdfBase64,
        subject,
        message,
        totalPages,
        signatureY,
        renderImageUrl: attachRender && selectedRenderUrl ? selectedRenderUrl : undefined,
      });

      if (sendResult.success) {
        toast.success(`Proposal sent to ${recipientEmail} for digital signature`);
        onSent?.(recipientEmail);
        setOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send for signature");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
          <PenLine className="h-3.5 w-3.5" />
          Send for Signature
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send for Digital Signature</DialogTitle>
          <DialogDescription>
            Send the proposal to {clientName || "the client"} for legally binding digital signature via SignWell.
            The client will see signature and date fields placed on the last page of the proposal.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="sig-name">Recipient Name</Label>
            <Input
              id="sig-name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="John Smith"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sig-email">Recipient Email</Label>
            <Input
              id="sig-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sig-subject">Email Subject</Label>
            <Input
              id="sig-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sig-message">Message to Signer</Label>
            <Textarea
              id="sig-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
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
                {/* Render selector */}
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

                {/* Thumbnail preview */}
                {selectedRenderUrl && (
                  <div className="relative rounded-md overflow-hidden border bg-muted/30">
                    <img
                      src={selectedRenderUrl}
                      alt="AI Render preview"
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ImageIcon className="h-2.5 w-2.5" />
                      Will be included as attachment
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
          <Button onClick={handleSend} disabled={sending || !recipientEmail || !recipientName} className="gap-2">
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <PenLine className="h-4 w-4" />
                Send for Signature
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
