/**
 * Inbox Compose — New email composition page with contact search autocomplete
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, MailPlus, X, Plus, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ContactResult = { name: string; email: string; type: string };

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Reusable contact search input with autocomplete dropdown */
function ContactSearchInput({
  label,
  emails,
  onAdd,
  onRemove,
  placeholder = "Search contacts or type email...",
}: {
  label: string;
  emails: string[];
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: contacts } = trpc.inbox.searchContacts.useQuery(
    { query: debouncedQuery },
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

  function addEmail(email: string) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (emails.includes(trimmed)) {
      toast.error("Already added");
      return;
    }
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      toast.error("Invalid email address");
      return;
    }
    onAdd(trimmed);
    setQuery("");
    setShowDropdown(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (query.trim()) {
        addEmail(query);
      }
    }
  }

  const typeColors: Record<string, string> = {
    lead: "bg-blue-100 text-blue-700",
    client: "bg-green-100 text-green-700",
    trade: "bg-orange-100 text-orange-700",
    supplier: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="flex items-start gap-3" ref={containerRef}>
      <Label className="w-16 text-sm text-muted-foreground shrink-0 pt-2">{label}</Label>
      <div className="flex-1 relative">
        {/* Email chips */}
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {emails.map((email) => (
              <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                {email}
                <button onClick={() => onRemove(email)} className="ml-0.5 hover:text-destructive">
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
                key={`${c.email}-${i}`}
                className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2 text-sm"
                onClick={() => addEmail(c.email)}
              >
                <div className="min-w-0">
                  <span className="font-medium truncate block">{c.name}</span>
                  <span className="text-xs text-muted-foreground truncate block">{c.email}</span>
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
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromAddressId, setFromAddressId] = useState<string>("default");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [includeRateUs, setIncludeRateUs] = useState(false);
  const { data: addresses } = trpc.inbox.addresses.list.useQuery();
  const { data: defaultSig } = trpc.inbox.signatures.getDefault.useQuery();
  const { data: replyTemplates = [] } = trpc.inbox.templates.list.useQuery();
  const composeMut = trpc.inbox.compose.useMutation({
    onSuccess: () => {
      toast.success("Email sent");
      setLocation("/inbox");
    },
    onError: (err) => toast.error(`Failed to send email: ${err.message}`),
  });

  function handleSend() {
    if (toEmails.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    composeMut.mutate({
      toAddress: toEmails[0],
      ccAddresses: [...toEmails.slice(1), ...ccEmails].length > 0 ? [...toEmails.slice(1), ...ccEmails] : undefined,
      subject: subject.trim(),
      htmlBody: body.replace(/\n/g, "<br/>"),
      textBody: body,
      includeSignature,
      includeRateUs,
      fromAddressId: fromAddressId !== "default" ? parseInt(fromAddressId) : undefined,
    });
  }

  function applyTemplate(templateId: string) {
    const template = replyTemplates.find((item: any) => String(item.id) === templateId);
    if (!template) return;
    const rawBody = template.bodyText || String(template.bodyHtml || "").replace(/<[^>]+>/g, "");
    const rendered = rawBody
      .replace(/\{\{\s*ticketSubject\s*\}\}/g, subject)
      .replace(/\{\{\s*clientName\s*\}\}/g, toEmails[0] || "")
      .replace(/\{\{\s*(jobNumber|branch|constructionManager)\s*\}\}/g, "");
    setBody((current) => current.trim() ? `${current.trim()}\n\n${rendered.trim()}` : rendered.trim());
    if (!subject && template.subject) setSubject(template.subject);
    toast.success(`Inserted "${template.name}"`);
  }

  return (
    <div className="p-4 md:p-6 max-w-[800px] mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Compose Email</h1>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* From */}
          {addresses && addresses.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-16 text-sm text-muted-foreground shrink-0">From</Label>
              <Select value={fromAddressId} onValueChange={setFromAddressId}>
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
            emails={toEmails}
            onAdd={(email) => setToEmails((prev) => [...prev, email])}
            onRemove={(email) => setToEmails((prev) => prev.filter((e) => e !== email))}
            placeholder="Search leads, clients, trades or type email..."
          />

          {/* CC toggle + field */}
          {!showCc ? (
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
              emails={ccEmails}
              onAdd={(email) => setCcEmails((prev) => [...prev, email])}
              onRemove={(email) => setCcEmails((prev) => prev.filter((e) => e !== email))}
              placeholder="Search contacts or type email..."
            />
          )}

          {/* Subject */}
          <div className="flex items-center gap-3">
            <Label className="w-16 text-sm text-muted-foreground shrink-0">Subject</Label>
            <Input
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          {replyTemplates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-16 text-sm text-muted-foreground shrink-0">Template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Insert canned reply" />
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

          <Textarea
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[250px]"
          />

          {/* Options */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
            <div className="flex flex-wrap items-center gap-4">
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
            </div>
            <Button onClick={handleSend} disabled={composeMut.isPending}>
              {composeMut.isPending ? "Sending..." : "Send"}
              <Send className="h-4 w-4 ml-2" />
            </Button>
          </div>

          {/* Signature Preview */}
          {includeSignature && (
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

          {/* Full Email Preview Dialog */}
          <div className="pt-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <Eye className="h-4 w-4 mr-2" /> Preview Email
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Email Preview</DialogTitle>
                </DialogHeader>
                <div className="border rounded-lg p-6 bg-white text-black">
                  {/* Email header */}
                  <div className="border-b pb-3 mb-4 space-y-1">
                    <p className="text-sm"><span className="font-medium text-muted-foreground">To:</span> {toEmails.join(", ") || "(no recipients)"}</p>
                    {ccEmails.length > 0 && <p className="text-sm"><span className="font-medium text-muted-foreground">Cc:</span> {ccEmails.join(", ")}</p>}
                    <p className="text-sm"><span className="font-medium text-muted-foreground">Subject:</span> {subject || "(no subject)"}</p>
                  </div>
                  {/* Email body */}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {body || <span className="text-muted-foreground italic">No message body</span>}
                  </div>
                  {/* Signature */}
                  {includeSignature && defaultSig && (
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
