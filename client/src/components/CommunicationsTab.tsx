/**
 * CommunicationsTab — Lead-level SMS + Call timeline
 * Shows threaded SMS conversation, call log entries, and SMS compose UI
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  MessageSquare,
  Phone,
  Send,
  ExternalLink,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
} from "lucide-react";

interface Props {
  leadId: number;
  leadPhone: string;
  leadName: string;
  branchId?: number | null;
}

export default function CommunicationsTab({ leadId, leadPhone, leadName, branchId }: Props) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> SMS
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-1.5">
            <Phone className="h-3.5 w-3.5" /> Calls
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <TimelineView leadId={leadId} />
        </TabsContent>
        <TabsContent value="sms">
          <SmsView leadId={leadId} leadPhone={leadPhone} leadName={leadName} branchId={branchId} />
        </TabsContent>
        <TabsContent value="calls">
          <CallsView leadId={leadId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Unified Timeline ────────────────────────────────────────────────────────
function TimelineView({ leadId }: { leadId: number }) {
  const { data: timeline, isLoading } = trpc.vocphone.getLeadTimeline.useQuery({ leadId });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading timeline...</p>;
  if (!timeline || timeline.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No communications recorded yet.</p>
          <p className="text-xs mt-1">Send an SMS or make a call to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Communication Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {timeline.map((item) => (
            <TimelineItem key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ item }: { item: any }) {
  const isInbound = item.direction === "inbound";
  const isSms = item.type === "sms";

  return (
    <div className={`flex gap-3 ${isInbound ? "" : "flex-row-reverse"}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isSms
          ? isInbound ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
          : isInbound ? "bg-purple-100 text-purple-600" : "bg-orange-100 text-orange-600"
      }`}>
        {isSms ? <MessageSquare className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
      </div>
      <div className={`flex-1 max-w-[75%] ${isInbound ? "" : "text-right"}`}>
        <div className={`inline-block rounded-lg px-3 py-2 text-sm ${
          isInbound
            ? "bg-muted text-foreground"
            : "bg-primary/10 text-foreground"
        }`}>
          {isSms ? (
            <p className="whitespace-pre-wrap">{item.body}</p>
          ) : (
            <div className="flex items-center gap-2">
              {isInbound ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
              <span>{item.body}</span>
              {item.duration > 0 && (
                <Badge variant="outline" className="text-[10px]">{formatDuration(item.duration)}</Badge>
              )}
              {item.recordingUrl && (
                <a href={item.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {isInbound ? `From: ${item.from}` : `To: ${item.to}`}
          {" · "}
          {new Date(item.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// ─── SMS View with Compose ───────────────────────────────────────────────────
function SmsView({ leadId, leadPhone, leadName, branchId }: { leadId: number; leadPhone: string; leadName: string; branchId?: number | null }) {
  const utils = trpc.useUtils();
  const { data: messages, isLoading } = trpc.vocphone.getLeadMessages.useQuery({ leadId });
  const { data: templates } = trpc.vocphone.templates.list.useQuery();
  const { data: smsNumbers } = trpc.vocphone.getSmsNumbers.useQuery();
  const { data: branchesList } = trpc.branches.list.useQuery();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [body, setBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [senderNumber, setSenderNumber] = useState<string>("");

  // Auto-select first sender number
  useEffect(() => {
    if (smsNumbers && (smsNumbers as any).list?.length > 0 && !senderNumber) {
      setSenderNumber((smsNumbers as any).list[0].number);
    }
  }, [smsNumbers, senderNumber]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMut = trpc.vocphone.sendSms.useMutation({
    onSuccess: () => {
      toast.success("SMS sent");
      setBody("");
      setSelectedTemplate("");
      utils.vocphone.getLeadMessages.invalidate({ leadId });
      utils.vocphone.getLeadTimeline.invalidate({ leadId });
    },
    onError: (err) => toast.error(err.message),
  });

  const activeTemplates = useMemo(
    () => (templates || []).filter((t: any) => t.isActive),
    [templates]
  );

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const tmpl = (templates || []).find((t: any) => t.id === Number(templateId));
    if (tmpl) {
      // Replace merge fields
      let text = tmpl.body;
      const firstName = leadName.split(" ")[0] || "";
      const lastName = leadName.split(" ").slice(1).join(" ") || "";
      text = text.replace(/\{\{firstName\}\}/g, firstName);
      text = text.replace(/\{\{lastName\}\}/g, lastName);
      text = text.replace(/\{\{fullName\}\}/g, leadName);
      text = text.replace(/\{\{phone\}\}/g, leadPhone);
      // Branch variables
      const branch = branchesList?.find((b: any) => b.id === branchId);
      text = text.replace(/\{\{branchName\}\}/g, branch?.name || "");
      text = text.replace(/\{\{branchAddress\}\}/g, branch?.address || "");
      text = text.replace(/\{\{branchPhone\}\}/g, branch?.phone || "");
      text = text.replace(/\{\{branchEmail\}\}/g, branch?.email || "");
      setBody(text);
    }
  }

  function handleSend() {
    if (!body.trim()) {
      toast.error("Please enter a message");
      return;
    }
    if (!senderNumber) {
      toast.error("No sender number available");
      return;
    }
    const recipient = leadPhone.replace(/\s+/g, "").replace(/^\+/, "");
    sendMut.mutate({
      leadId,
      recipient,
      sender: senderNumber,
      body: body.trim(),
      templateId: selectedTemplate ? Number(selectedTemplate) : undefined,
    });
  }

  return (
    <div className="space-y-4">
      {/* Message Thread */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> SMS Conversation
            {leadPhone && <Badge variant="outline" className="text-xs font-normal">{leadPhone}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={scrollRef} className="space-y-3 max-h-[350px] overflow-y-auto mb-4">
            {isLoading && <p className="text-sm text-muted-foreground">Loading messages...</p>}
            {!isLoading && (!messages || messages.length === 0) && (
              <p className="text-sm text-muted-foreground italic text-center py-4">No SMS messages yet.</p>
            )}
            {messages && messages.slice().reverse().map((msg: any) => (
              <div key={msg.id} className={`flex ${msg.direction === "inbound" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  msg.direction === "inbound"
                    ? "bg-muted text-foreground"
                    : "bg-primary text-primary-foreground"
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  <p className={`text-[10px] mt-1 ${msg.direction === "inbound" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                    {new Date(msg.createdAt).toLocaleString()}
                    {msg.status && msg.status !== "sent" && ` · ${msg.status}`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Compose Area */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex gap-2">
              {/* Template picker */}
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Use template..." />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sender number */}
              {(smsNumbers as any)?.list?.length > 1 && (
                <Select value={senderNumber} onValueChange={setSenderNumber}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="From..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(smsNumbers as any).list.map((n: any) => (
                      <SelectItem key={n.number} value={n.number}>{n.name || n.number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Message to ${leadName || leadPhone}...`}
                rows={3}
                className="flex-1"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button
                onClick={handleSend}
                disabled={sendMut.isPending || !body.trim()}
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Press Ctrl+Enter to send · {body.length}/160 chars</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Calls View ──────────────────────────────────────────────────────────────
function CallsView({ leadId }: { leadId: number }) {
  const { data: calls, isLoading } = trpc.vocphone.getLeadCalls.useQuery({ leadId });
  const utils = trpc.useUtils();
  const syncMut = trpc.vocphone.syncCalls.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} call records`);
      utils.vocphone.getLeadCalls.invalidate({ leadId });
      utils.vocphone.getLeadTimeline.invalidate({ leadId });
    },
    onError: (err) => toast.error(err.message),
  });
  const resyncMut = trpc.vocphone.resyncUnlinkedCalls.useMutation({
    onSuccess: (data) => {
      toast.success(`Linked ${data.linked} of ${data.total} unlinked calls to leads`);
      utils.vocphone.getLeadCalls.invalidate({ leadId });
      utils.vocphone.getLeadTimeline.invalidate({ leadId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4" /> Call Log
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resyncMut.mutate()}
              disabled={resyncMut.isPending}
              title="Re-match unlinked calls to leads by phone number"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${resyncMut.isPending ? "animate-spin" : ""}`} />
              Resync Unlinked
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMut.mutate({})}
              disabled={syncMut.isPending}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
              Sync Calls
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading calls...</p>}
        {!isLoading && (!calls || calls.length === 0) && (
          <p className="text-sm text-muted-foreground italic text-center py-4">No call records for this lead.</p>
        )}
        {calls && calls.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {calls.map((call: any) => (
              <div key={call.id} className="flex items-start gap-3 border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  call.direction === "inbound" ? "bg-purple-100 text-purple-600" : "bg-orange-100 text-orange-600"
                }`}>
                  {call.direction === "inbound" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{call.direction}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {call.direction === "inbound" ? `From: ${call.fromNumber}` : `To: ${call.toNumber}`}
                    </Badge>
                    {call.duration > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{formatDuration(call.duration)}</Badge>
                    )}
                  </div>
                  {call.callSummary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{call.callSummary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(call.createdAt).toLocaleString()}
                    </span>
                    {call.extension && (
                      <Badge variant="outline" className="text-[10px]">Ext: {call.extension}</Badge>
                    )}
                    {call.recordingUrl && (
                      <a
                        href={call.recordingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" /> Recording
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
