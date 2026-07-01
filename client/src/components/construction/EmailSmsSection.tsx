import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import RichTextEditor from "@/components/RichTextEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mail, MessageSquare, Send, Loader2, Clock, Users, FileText, CheckCheck, Check, AlertCircle, Eye, User } from "lucide-react";
import { toast } from "sonner";

interface EmailSmsSectionProps {
  jobId: number;
  assignments: Array<{
    id: number;
    installerId: number;
    installer: {
      id: number;
      name: string;
      phone: string | null;
      email: string | null;
      tradeType: string;
    } | null;
  }>;
  clientName?: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  siteAddress?: string | null;
  quoteNumber?: string | null;
}

const DELIVERY_STATUS: Record<string, { label: string; icon: any; color: string; tooltip: string }> = {
  sent: { label: "Sent", icon: Check, color: "text-blue-500", tooltip: "Message sent" },
  delivered: { label: "Delivered", icon: CheckCheck, color: "text-green-500", tooltip: "Message delivered" },
  read: { label: "Read", icon: Eye, color: "text-emerald-600", tooltip: "Message read" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-red-500", tooltip: "Delivery failed" },
};

type RecipientMode = "client" | "single-trade" | "all-trades";

export default function EmailSmsSection({ jobId, assignments, clientName, clientEmail, clientPhone, siteAddress, quoteNumber }: EmailSmsSectionProps) {
  const [showCompose, setShowCompose] = useState(false);
  const [composeType, setComposeType] = useState<"email" | "sms">("sms");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("client");
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isMarketing, setIsMarketing] = useState(false);

  const commsQuery = trpc.construction.jobComms.list.useQuery({ jobId });
  const utils = trpc.useUtils();

  // Determine template category based on recipient mode
  const templateCategory = recipientMode === "client" ? "Client" : "Trade";

  const smsTemplatesQuery = trpc.construction.jobComms.smsTemplates.useQuery({ category: templateCategory });
  const emailTemplatesQuery = trpc.construction.jobComms.emailTemplates.useQuery({ category: templateCategory });

  const sendMutation = trpc.construction.jobComms.send.useMutation({
    onSuccess: () => {
      toast.success("Message sent");
      utils.construction.jobComms.list.invalidate({ jobId });
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkSendMutation = trpc.construction.jobComms.bulkSend.useMutation({
    onSuccess: (data) => {
      toast.success(`Sent to ${data.sent} of ${data.total} recipients`);
      utils.construction.jobComms.list.invalidate({ jobId });
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const templates = composeType === "sms" ? (smsTemplatesQuery.data || []) : (emailTemplatesQuery.data || []);

  function resetForm() {
    setShowCompose(false);
    setBody("");
    setSubject("");
    setSelectedRecipient("");
    setSelectedTemplate("");
    setRecipientMode("client");
    setIsMarketing(false);
  }

  // Merge field replacement for templates
  function applyMergeFields(text: string): string {
    const firstName = clientName?.split(" ")[0] || "";
    const lastName = clientName?.split(" ").slice(1).join(" ") || "";
    return text
      .replace(/\{\{clientName\}\}/gi, clientName || "")
      .replace(/\{\{firstName\}\}/gi, firstName)
      .replace(/\{\{lastName\}\}/gi, lastName)
      .replace(/\{\{fullName\}\}/gi, clientName || "")
      .replace(/\{\{siteAddress\}\}/gi, siteAddress || "")
      .replace(/\{\{quoteNumber\}\}/gi, quoteNumber || "")
      .replace(/\{\{email\}\}/gi, clientEmail || "")
      .replace(/\{\{phone\}\}/gi, clientPhone || "")
      .replace(/\{\{jobId\}\}/gi, String(jobId));
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    if (composeType === "sms") {
      const tmpl = (smsTemplatesQuery.data || []).find(t => String(t.id) === templateId);
      if (tmpl) setBody(applyMergeFields(tmpl.body));
    } else {
      const tmpl = (emailTemplatesQuery.data || []).find(t => String(t.id) === templateId);
      if (tmpl) {
        setSubject(applyMergeFields(tmpl.subject));
        setBody(applyMergeFields(tmpl.body));
      }
    }
  }

  function handleSend() {
    if (recipientMode === "all-trades") {
      const recipients = assignments
        .filter(a => a.installer)
        .map(a => ({
          name: a.installer!.name,
          contact: composeType === "sms" ? (a.installer!.phone || "") : (a.installer!.email || ""),
        }))
        .filter(r => r.contact);
      if (recipients.length === 0) {
        toast.error("No trades have " + (composeType === "sms" ? "phone numbers" : "email addresses"));
        return;
      }
      bulkSendMutation.mutate({
        jobId,
        type: composeType,
        subject: composeType === "email" ? subject : undefined,
        body,
        isMarketing,
        recipients,
      });
    } else if (recipientMode === "client") {
      const contact = composeType === "sms" ? clientPhone : clientEmail;
      if (!contact) {
        toast.error(`Client has no ${composeType === "sms" ? "phone number" : "email address"}`);
        return;
      }
      sendMutation.mutate({
        jobId,
        type: composeType,
        recipientName: clientName || "Client",
        recipientContact: contact,
        subject: composeType === "email" ? subject : undefined,
        body,
        isMarketing,
      });
    } else {
      // single-trade
      const a = assignments.find(a => String(a.installerId) === selectedRecipient);
      if (!a?.installer) return;
      const contact = composeType === "sms" ? a.installer.phone : a.installer.email;
      if (!contact) {
        toast.error(`${a.installer.name} has no ${composeType === "sms" ? "phone number" : "email address"}`);
        return;
      }
      sendMutation.mutate({
        jobId,
        type: composeType,
        recipientName: a.installer.name,
        recipientContact: contact,
        subject: composeType === "email" ? subject : undefined,
        body,
        isMarketing,
      });
    }
  }

  const comms = commsQuery.data || [];
  const isSending = sendMutation.isPending || bulkSendMutation.isPending;

  // Compute delivery stats
  const deliveredCount = comms.filter(c => c.status === "delivered" || c.deliveredAt).length;
  const readCount = comms.filter(c => c.status === "read" || c.readAt).length;
  const failedCount = comms.filter(c => c.status === "failed").length;

  function getDeliveryStatus(c: any): string {
    if (c.status === "failed" || c.failedReason) return "failed";
    if (c.readAt || c.status === "read") return "read";
    if (c.deliveredAt || c.status === "delivered") return "delivered";
    return "sent";
  }

  // Check if send button should be enabled
  const canSend = (() => {
    if (!body) return false;
    if (recipientMode === "single-trade" && !selectedRecipient) return false;
    if (recipientMode === "client") {
      const contact = composeType === "sms" ? clientPhone : clientEmail;
      if (!contact) return false;
    }
    return true;
  })();

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-3">
            <div className="text-2xl font-bold">{comms.length}</div>
            <div className="text-xs text-muted-foreground">Total Messages</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold">{comms.filter(c => c.type === "sms").length}</div>
            <div className="text-xs text-muted-foreground">SMS Sent</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold">{comms.filter(c => c.type === "email").length}</div>
            <div className="text-xs text-muted-foreground">Emails Sent</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-600">{deliveredCount}</div>
            <div className="text-xs text-muted-foreground">Delivered</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-red-600">{failedCount}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </Card>
        </div>

        {/* Compose Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => { setComposeType("sms"); setShowCompose(true); }}>
            <MessageSquare className="h-4 w-4 mr-1.5" /> Send SMS
          </Button>
          <Button variant="outline" onClick={() => { setComposeType("email"); setShowCompose(true); }}>
            <Mail className="h-4 w-4 mr-1.5" /> Send Email
          </Button>
        </div>

        {/* Compose Dialog */}
        <Dialog open={showCompose} onOpenChange={(open) => { if (!open) resetForm(); else setShowCompose(true); }}>
          <DialogContent className={`${composeType === "email" ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto`}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {composeType === "sms" ? <MessageSquare className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                Send {composeType === "sms" ? "SMS" : "Email"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Recipient mode */}
              <div className="space-y-2">
                <Label>To</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={recipientMode === "client" ? "default" : "outline"}
                    onClick={() => { setRecipientMode("client"); setSelectedTemplate(""); }}
                  >
                    <User className="h-4 w-4 mr-1" /> Client
                  </Button>
                  <Button
                    size="sm"
                    variant={recipientMode === "single-trade" ? "default" : "outline"}
                    onClick={() => { setRecipientMode("single-trade"); setSelectedTemplate(""); }}
                  >
                    Single Trade
                  </Button>
                  <Button
                    size="sm"
                    variant={recipientMode === "all-trades" ? "default" : "outline"}
                    onClick={() => { setRecipientMode("all-trades"); setSelectedTemplate(""); }}
                  >
                    <Users className="h-4 w-4 mr-1" /> All Trades ({assignments.filter(a => a.installer).length})
                  </Button>
                </div>

                {/* Client recipient info */}
                {recipientMode === "client" && (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-foreground">{clientName || "Client"}</span>
                    {" — "}
                    {composeType === "sms"
                      ? (clientPhone || <span className="text-destructive">No phone number</span>)
                      : (clientEmail || <span className="text-destructive">No email address</span>)
                    }
                  </div>
                )}

                {/* Trade recipient picker */}
                {recipientMode === "single-trade" && (
                  <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a trade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assignments.filter(a => a.installer).map(a => (
                        <SelectItem key={a.installerId} value={String(a.installerId)}>
                          {a.installer!.name} — {composeType === "sms" ? (a.installer!.phone || "No phone") : (a.installer!.email || "No email")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Template picker */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Template</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Use a template (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name || t.letterType || `Template #${t.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Subject (email only) */}
              {composeType === "email" && (
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject..." />
                </div>
              )}

              <div className="space-y-1 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="jobcomms-marketing"
                    checked={isMarketing}
                    onCheckedChange={setIsMarketing}
                  />
                  <Label htmlFor="jobcomms-marketing" className="text-sm">Marketing message</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Adds unsubscribe wording and suppresses opted-out recipients. Leave off for job, safety, appointment or invoice messages.
                </p>
              </div>

              {/* Body */}
              <div className="space-y-2">
                <Label>Message</Label>
                {composeType === "email" ? (
                  <RichTextEditor
                    content={body}
                    onChange={setBody}
                    placeholder="Compose your email..."
                  />
                ) : (
                  <>
                    <Textarea
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      placeholder="Type your SMS message..."
                      rows={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      {body.length} / 160 characters {body.length > 160 ? `(${Math.ceil(body.length / 160)} SMS parts)` : ""}
                      {isMarketing ? " · STOP wording will be appended" : ""}
                    </p>
                  </>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={resetForm} className="w-full sm:w-auto">Cancel</Button>
              <Button
                onClick={handleSend}
                disabled={!canSend || isSending}
                className="w-full sm:w-auto"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Communication Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Communication History</CardTitle>
          </CardHeader>
          <CardContent>
            {commsQuery.isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!commsQuery.isLoading && comms.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No messages sent for this job yet.</p>
            )}
            <div className="space-y-3">
              {comms.map(c => {
                const ds = getDeliveryStatus(c);
                const statusCfg = DELIVERY_STATUS[ds] || DELIVERY_STATUS.sent;
                const StatusIcon = statusCfg.icon;
                return (
                  <div key={c.id} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {c.type === "sms" ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          <MessageSquare className="h-3 w-3 mr-0.5" /> SMS
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          <Mail className="h-3 w-3 mr-0.5" /> Email
                        </Badge>
                      )}
                      <span className="text-sm font-medium">{c.recipientName}</span>
                      <span className="text-xs text-muted-foreground">{c.recipientContact}</span>
                      {/* Delivery status badge */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${statusCfg.color}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {statusCfg.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-0.5">
                            <p>{statusCfg.tooltip}</p>
                            {c.deliveredAt && <p>Delivered: {new Date(c.deliveredAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                            {c.readAt && <p>Read: {new Date(c.readAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                            {c.failedReason && <p className="text-red-400">Reason: {c.failedReason}</p>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(c.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {c.subject && <p className="text-sm font-medium mb-0.5">{c.subject}</p>}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.body}</p>
                    {c.sentByName && <p className="text-xs text-muted-foreground mt-1">Sent by {c.sentByName}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
