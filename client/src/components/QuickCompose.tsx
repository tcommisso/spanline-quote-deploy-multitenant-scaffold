/**
 * QuickCompose — Lightweight email compose popover for the floating chat button.
 * Allows sending a quick email without navigating away from the current page.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, X, Minimize2 } from "lucide-react";
import { toast } from "sonner";

interface QuickComposeProps {
  onClose: () => void;
  onSent?: () => void;
}

export function QuickCompose({ onClose, onSent }: QuickComposeProps) {
  const [toAddress, setToAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const composeMut = trpc.inbox.compose.useMutation({
    onSuccess: () => {
      toast.success("Email sent");
      setToAddress("");
      setSubject("");
      setBody("");
      onSent?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSend() {
    if (!toAddress.trim() || !subject.trim()) {
      toast.error("Please fill in To and Subject fields");
      return;
    }
    composeMut.mutate({
      toAddress: toAddress.trim(),
      subject: subject.trim(),
      htmlBody: body.replace(/\n/g, "<br/>"),
      textBody: body,
      includeSignature: true,
      includeRateUs: false,
    });
  }

  return (
    <div className="w-[360px] max-w-[calc(100vw-2rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-3">
        <h3 className="text-sm font-semibold">Quick Compose</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Subject</Label>
          <Input
            placeholder="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Message</Label>
          <Textarea
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[120px] text-sm resize-none"
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-muted-foreground">Signature will be included</p>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={composeMut.isPending}
            className="h-8"
          >
            {composeMut.isPending ? "Sending..." : "Send"}
            <Send className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
