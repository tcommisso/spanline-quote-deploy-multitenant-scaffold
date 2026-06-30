/**
 * Inbox Compose — New email composition page with contact search autocomplete
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  appendTemplateBody,
  formatEmailTemplateLabel,
  formatTemplateKey,
  messageBodyToHtml,
  messageBodyToText,
  renderTemplateVariables,
} from "@/lib/email-template-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, MailPlus, X, Plus, Eye, Mail, MessageSquare, Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ComposeChannel = "email" | "sms" | "push";
type ContactResult = {
  name: string;
  email?: string | null;
  phone?: string | null;
  pushTarget?: string | null;
  type: string;
};
type ComposeRecipient = {
  value: string;
  label: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  pushTarget?: string | null;
  type?: string;
};

const CHANNEL_LABELS: Record<ComposeChannel, string> = {
  email: "Email",
  sms: "SMS",
  push: "Push",
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function contactValueForChannel(channel: ComposeChannel, contact: ContactResult) {
  if (channel === "email") return contact.email?.trim().toLowerCase() || "";
  if (channel === "sms") return contact.phone?.trim() || "";
  return contact.pushTarget || "";
}

function contactLabelForChannel(channel: ComposeChannel, contact: ContactResult) {
  if (channel === "email") return contact.email || "";
  if (channel === "sms") return contact.phone || "";
  return contact.name;
}

function manualRecipientForChannel(channel: ComposeChannel, rawValue: string): ComposeRecipient | null {
  const value = rawValue.trim();
  if (!value) return null;
  if (channel === "email") {
    const email = value.toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      toast.error("Invalid email address");
      return null;
    }
    return { value: email, label: email, email, name: email, type: "manual" };
  }
  if (channel === "sms") {
    const digits = value.replace(/[^\d+]/g, "");
    if (digits.replace(/[^\d]/g, "").length < 10) {
      toast.error("Invalid phone number");
      return null;
    }
    return { value: digits, label: digits, phone: digits, name: digits, type: "manual" };
  }
  toast.error("Search and select a push recipient");
  return null;
}

/** Reusable recipient search input with autocomplete dropdown */
function ContactSearchInput({
  label,
  channel,
  recipients,
  onAdd,
  onRemove,
  placeholder = "Search contacts...",
}: {
  label: string;
  channel: ComposeChannel;
  recipients: ComposeRecipient[];
  onAdd: (recipient: ComposeRecipient) => void;
  onRemove: (value: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: contacts } = trpc.inbox.searchContacts.useQuery(
    { query: debouncedQuery, channel },
    { enabled: debouncedQuery.length >= 2 }
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addRecipient(recipient: ComposeRecipient) {
    if (!recipient.value) return;
    if (recipients.some((item) => item.value === recipient.value)) {
      toast.error("Already added");
      return;
    }
    onAdd(recipient);
    setQuery("");
    setShowDropdown(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (query.trim() && channel !== "push") {
        const manual = manualRecipientForChannel(channel, query);
        if (manual) addRecipient(manual);
      }
    }
  }

  const typeColors: Record<string, string> = {
    lead: "bg-blue-100 text-blue-700",
    client: "bg-green-100 text-green-700",
    trade: "bg-orange-100 text-orange-700",
    supplier: "bg-purple-100 text-purple-700",
    staff: "bg-slate-100 text-slate-700",
    "client portal": "bg-green-100 text-green-700",
    "trade portal": "bg-orange-100 text-orange-700",
  };

  return (
    <div className="flex items-start gap-3" ref={containerRef}>
      <Label className="w-16 text-sm text-muted-foreground shrink-0 pt-2">{label}</Label>
      <div className="flex-1 relative">
        {/* Email chips */}
        {recipients.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {recipients.map((recipient) => (
              <Badge key={recipient.value} variant="secondary" className="text-xs gap-1 pr-1">
                {recipient.label}
                <button onClick={() => onRemove(recipient.value)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {/* Search input */}
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.length >= 2) setShowDropdown(true);
          }}
          onFocus={() => { if (query.length >= 2) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
        />
        {/* Dropdown */}
        {showDropdown && contacts && contacts.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {contacts.map((c: ContactResult, i: number) => (
              <button
                key={`${contactValueForChannel(channel, c) || c.name}-${i}`}
                className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2 text-sm"
                onClick={() => {
                  const value = contactValueForChannel(channel, c);
                  const label = contactLabelForChannel(channel, c);
                  if (!value || !label) return;
                  addRecipient({
                    value,
                    label,
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    pushTarget: c.pushTarget,
                    type: c.type,
                  });
                }}
              >
                <div className="min-w-0">
                  <span className="font-medium truncate block">{c.name}</span>
                  <span className="text-xs text-muted-foreground truncate block">
                    {channel === "email" ? c.email : channel === "sms" ? c.phone : c.email || c.phone || c.pushTarget}
                  </span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${typeColors[c.type] || "bg-gray-100 text-gray-600"}`}>
                  {c.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InboxCompose() {
  const [, setLocation] = useLocation();
  const fromAddressTouchedRef = useRef(false);
  const prefillAppliedRef = useRef(false);
  const [sendChannel, setSendChannel] = useState<ComposeChannel>("email");
  const [recipients, setRecipients] = useState<ComposeRecipient[]>([]);
  const [ccRecipients, setCcRecipients] = useState<ComposeRecipient[]>([]);
  const [recipientNamesByEmail, setRecipientNamesByEmail] = useState<Record<string, string>>({});
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromAddressId, setFromAddressId] = useState<string>("default");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [includeRateUs, setIncludeRateUs] = useState(false);
  const [emailTemplateCategory, setEmailTemplateCategory] = useState("all");
  const { data: addresses } = trpc.inbox.addresses.list.useQuery();
  const { data: composeDefaults } = trpc.inbox.composeDefaults.useQuery();
  const { data: defaultSig } = trpc.inbox.signatures.getDefault.useQuery();
  const { data: replyTemplates = [] } = trpc.inbox.templates.list.useQuery();
  const { data: emailTemplates = [] } = trpc.crm.emailTemplates.list.useQuery();
  const emailTemplateCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const template of emailTemplates as any[]) {
      const category = String(template.category || "General").trim() || "General";
      categories.add(category);
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [emailTemplates]);
  const filteredEmailTemplates = useMemo(() => {
    const templates = emailTemplates as any[];
    if (emailTemplateCategory === "all") return templates;
    return templates.filter((template) => (String(template.category || "General").trim() || "General") === emailTemplateCategory);
  }, [emailTemplates, emailTemplateCategory]);
  const composeMut = trpc.inbox.compose.useMutation({
    onSuccess: (result: any) => {
      toast.success(`${CHANNEL_LABELS[(result?.channel || sendChannel) as ComposeChannel] || "Message"} sent`);
      setLocation("/inbox");
    },
    onError: (err) => toast.error(`Failed to send message: ${err.message}`),
  });

  useEffect(() => {
    if (fromAddressTouchedRef.current) return;
    if (composeDefaults?.fromAddressId) {
      setFromAddressId(String(composeDefaults.fromAddressId));
    }
  }, [composeDefaults?.fromAddressId]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const to = params.get("to")?.trim().toLowerCase();
    const name = params.get("name")?.trim();
    const subjectParam = params.get("subject")?.trim();
    const bodyParam = params.get("body")?.trim();
    if (to) {
      setRecipients((current) => current.some((recipient) => recipient.value === to) ? current : [
        ...current,
        { value: to, label: to, email: to, name: name || to, type: "manual" },
      ]);
      if (name) {
        setRecipientNamesByEmail((current) => ({ ...current, [to]: name }));
      }
    }
    if (subjectParam) {
      setSubject((current) => current.trim() ? current : subjectParam);
    }
    if (bodyParam) {
      setBody((current) => current.trim() ? current : bodyParam);
    }
  }, []);

  function handleChannelChange(value: ComposeChannel) {
    setSendChannel(value);
    setRecipients([]);
    setCcRecipients([]);
    setShowCc(false);
    if (value !== "email") {
      setIncludeSignature(false);
      setIncludeRateUs(false);
    } else {
      setIncludeSignature(true);
    }
  }

  function handleSend() {
    if (recipients.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }
    if (sendChannel !== "sms" && !subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter a message");
      return;
    }
    const primary = recipients[0];
    composeMut.mutate({
      sendChannel,
      toAddress: sendChannel === "email" ? primary.email || primary.value : undefined,
      toPhone: sendChannel === "sms" ? primary.phone || primary.value : undefined,
      toPushTarget: sendChannel === "push" ? primary.pushTarget || primary.value : undefined,
      ccAddresses: sendChannel === "email"
        ? [...recipients.slice(1), ...ccRecipients]
          .map((recipient) => recipient.email || recipient.value)
          .filter((value): value is string => Boolean(value))
        : undefined,
      subject: subject.trim(),
      htmlBody: messageBodyToHtml(body),
      textBody: messageBodyToText(body),
      includeSignature: sendChannel === "email" ? includeSignature : false,
      includeRateUs: sendChannel === "email" ? includeRateUs : false,
      fromAddressId: fromAddressId !== "default" ? parseInt(fromAddressId) : undefined,
    });
  }

  function addRecipient(recipient: ComposeRecipient) {
    setRecipients((prev) => [...prev, recipient]);
    if (recipient.email && recipient.name) {
      setRecipientNamesByEmail((prev) => ({ ...prev, [recipient.email!.toLowerCase()]: recipient.name! }));
    }
  }

  function removeRecipient(value: string) {
    const removed = recipients.find((recipient) => recipient.value === value);
    setRecipients((prev) => prev.filter((item) => item.value !== value));
    setRecipientNamesByEmail((prev) => {
      const next = { ...prev };
      if (removed?.email) delete next[removed.email.toLowerCase()];
      return next;
    });
  }

  function applyTemplateVariables(value: string) {
    const primaryEmail = recipients[0]?.email || "";
    const clientName = recipientNamesByEmail[primaryEmail] || "";
    return renderTemplateVariables(value, {
      ticketSubject: subject,
      clientName,
      jobNumber: "",
      branch: "",
      constructionManager: "",
    });
  }

  function applyReplyTemplate(templateId: string) {
    const template = replyTemplates.find((item: any) => String(item.id) === templateId);
    if (!template) return;
    const rawBody = template.bodyText || String(template.bodyHtml || "").replace(/<[^>]+>/g, "");
    const rendered = applyTemplateVariables(rawBody);
    setBody((current) => appendTemplateBody(current, rendered));
    if (!subject && template.subject) setSubject(applyTemplateVariables(template.subject));
    toast.success(`Inserted "${template.name}"`);
  }

  function applyEmailTemplate(templateId: string) {
    const template = (emailTemplates as any[]).find((item) => String(item.id) === templateId);
    if (!template) return;
    const rendered = applyTemplateVariables(template.body || "");
    setBody((current) => appendTemplateBody(current, rendered));
    if (!subject.trim() && template.subject) setSubject(applyTemplateVariables(template.subject));
    toast.success(`Inserted "${formatEmailTemplateLabel(template)}"`);
  }

  return (
    <div className="p-4 md:p-6 max-w-[800px] mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Compose Message</h1>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="w-16 text-sm text-muted-foreground shrink-0">Channel</Label>
            <Select value={sendChannel} onValueChange={(value) => handleChannelChange(value as ComposeChannel)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span>
                </SelectItem>
                <SelectItem value="sms">
                  <span className="inline-flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> SMS</span>
                </SelectItem>
                <SelectItem value="push">
                  <span className="inline-flex items-center gap-2"><Bell className="h-3.5 w-3.5" /> Push</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* From */}
          {sendChannel === "email" && addresses && addresses.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-16 text-sm text-muted-foreground shrink-0">From</Label>
              <Select value={fromAddressId} onValueChange={(value) => { fromAddressTouchedRef.current = true; setFromAddressId(value); }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select from address" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {addresses.map((addr: any) => (
                    <SelectItem key={addr.id} value={addr.id.toString()}>
                      {addr.displayName} ({addr.address})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* To — with contact search */}
          <ContactSearchInput
            label="To"
            channel={sendChannel}
            recipients={recipients}
            onAdd={addRecipient}
            onRemove={removeRecipient}
            placeholder={
              sendChannel === "email"
                ? "Search leads, clients, trades or type email..."
                : sendChannel === "sms"
                ? "Search contacts or type phone number..."
                : "Search staff, client portal, or trade portal..."
            }
          />

          {/* CC toggle + field */}
          {sendChannel === "email" && (!showCc ? (
            <div className="flex items-center gap-3">
              <div className="w-16" />
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setShowCc(true)}
              >
                <Plus className="h-3 w-3" /> Add CC
              </button>
            </div>
          ) : (
            <ContactSearchInput
              label="CC"
              channel="email"
              recipients={ccRecipients}
              onAdd={(recipient) => setCcRecipients((prev) => [...prev, recipient])}
              onRemove={(value) => setCcRecipients((prev) => prev.filter((recipient) => recipient.value !== value))}
              placeholder="Search contacts or type email..."
            />
          ))}

          {/* Subject */}
          {sendChannel !== "sms" && (
            <div className="flex items-center gap-3">
              <Label className="w-16 text-sm text-muted-foreground shrink-0">{sendChannel === "push" ? "Title" : "Subject"}</Label>
              <Input
                placeholder={sendChannel === "push" ? "Push notification title" : "Email subject"}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          {/* Body */}
          {replyTemplates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-28 text-sm text-muted-foreground shrink-0">Reply Templates</Label>
              <Select onValueChange={applyReplyTemplate}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Insert reply template" />
                </SelectTrigger>
                <SelectContent>
                  {replyTemplates.map((template: any) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {emailTemplates.length > 0 && (
            <div className="flex items-start gap-3">
              <Label className="w-28 text-sm text-muted-foreground shrink-0 pt-2">Templates</Label>
              <div className="flex-1 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <Select value={emailTemplateCategory} onValueChange={setEmailTemplateCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {emailTemplateCategories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={applyEmailTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Insert email template" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredEmailTemplates.map((template: any) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {formatEmailTemplateLabel(template)}
                        {template.letterType ? ` (${formatTemplateKey(template.letterType)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Textarea
            placeholder={sendChannel === "sms" ? "Write your SMS..." : "Write your message..."}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={sendChannel === "sms" ? "min-h-[160px]" : "min-h-[250px]"}
          />

          {/* Options */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
            <div className="flex flex-wrap items-center gap-4">
              {sendChannel === "email" && (
                <>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="compose-sig"
                      checked={includeSignature}
                      onCheckedChange={setIncludeSignature}
                    />
                    <Label htmlFor="compose-sig" className="text-sm">Include Signature</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="compose-rateus"
                      checked={includeRateUs}
                      onCheckedChange={setIncludeRateUs}
                    />
                    <Label htmlFor="compose-rateus" className="text-sm">Include Rate Us</Label>
                  </div>
                </>
              )}
            </div>
            <Button onClick={handleSend} disabled={composeMut.isPending}>
              {composeMut.isPending ? "Sending..." : "Send"}
              <Send className="h-4 w-4 ml-2" />
            </Button>
          </div>

          {/* Signature Preview */}
          {sendChannel === "email" && includeSignature && (
            <div className="pt-3 border-t">
              {defaultSig ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Signature: {defaultSig.name}{(defaultSig as any).isCompanyDefault && <span className="ml-1 text-amber-600">(company default)</span>}</p>
                    <a href="/profile" className="text-xs text-primary hover:underline">Manage signatures</a>
                  </div>
                  <div className="text-xs text-muted-foreground border rounded p-2 max-h-[80px] overflow-hidden" dangerouslySetInnerHTML={{ __html: defaultSig.htmlContent }} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No default signature set. <a href="/profile" className="text-primary hover:underline">Create one in your profile</a></p>
              )}
            </div>
          )}

          {/* Full Message Preview Dialog */}
          <div className="pt-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <Eye className="h-4 w-4 mr-2" /> Preview {CHANNEL_LABELS[sendChannel]}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{CHANNEL_LABELS[sendChannel]} Preview</DialogTitle>
                </DialogHeader>
                <div className="border rounded-lg p-6 bg-white text-black">
                  {/* Email header */}
                  <div className="border-b pb-3 mb-4 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium text-muted-foreground">To:</span>{" "}
                      {recipients.map((recipient) => recipient.label).join(", ") || "(no recipients)"}
                    </p>
                    {sendChannel === "email" && ccRecipients.length > 0 && (
                      <p className="text-sm">
                        <span className="font-medium text-muted-foreground">Cc:</span>{" "}
                        {ccRecipients.map((recipient) => recipient.label).join(", ")}
                      </p>
                    )}
                    {sendChannel !== "sms" && (
                      <p className="text-sm">
                        <span className="font-medium text-muted-foreground">{sendChannel === "push" ? "Title:" : "Subject:"}</span>{" "}
                        {subject || "(none)"}
                      </p>
                    )}
                  </div>
                  {/* Email body */}
                  {body ? (
                    <div
                      className="prose prose-sm max-w-none text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: messageBodyToHtml(body) }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      <span className="text-muted-foreground italic">No message body</span>
                    </div>
                  )}
                  {/* Signature */}
                  {sendChannel === "email" && includeSignature && defaultSig && (
                    <div className="mt-6 pt-4 border-t">
                      <div dangerouslySetInnerHTML={{ __html: defaultSig.htmlContent }} />
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
