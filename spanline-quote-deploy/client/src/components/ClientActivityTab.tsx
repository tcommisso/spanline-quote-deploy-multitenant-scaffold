import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageSquare, Image, FileText, Mail, Phone,
  Upload, Trash2, Eye, EyeOff, Send, Plus, Loader2, BookTemplate,
  Paperclip, CheckCircle2, MailOpen, MousePointerClick, AlertTriangle,
} from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "photo", label: "Photo", icon: Image, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "file", label: "File", icon: FileText, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "sms", label: "SMS", icon: Phone, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "email", label: "Email", icon: Mail, color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
] as const;

type ActivityType = "note" | "photo" | "file" | "sms" | "email";

interface ClientActivityTabProps {
  jobId: number;
  leadId?: number | null;
  readOnly?: boolean;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
}

/**
 * Email tracking status badge - shows delivery/open/click status for email activities
 */
function EmailTrackingBadge({ activityId }: { activityId: number }) {
  const { data: events } = trpc.clientActivities.getEmailEvents.useQuery(
    { activityId },
    { enabled: !!activityId, refetchInterval: 30000 }
  );

  if (!events || events.length === 0) return null;

  // Get the most advanced status
  const event = events[0];
  const status = event.status;

  const statusConfig: Record<string, { icon: any; label: string; className: string }> = {
    sent: { icon: Send, label: "Sent", className: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" },
    delivered: { icon: CheckCircle2, label: "Delivered", className: "text-green-600 bg-green-50 dark:bg-green-900/20" },
    opened: { icon: MailOpen, label: `Opened${event.openCount > 1 ? ` (${event.openCount}x)` : ""}`, className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" },
    clicked: { icon: MousePointerClick, label: `Clicked${event.clickCount > 1 ? ` (${event.clickCount}x)` : ""}`, className: "text-purple-600 bg-purple-50 dark:bg-purple-900/20" },
    bounced: { icon: AlertTriangle, label: "Bounced", className: "text-red-600 bg-red-50 dark:bg-red-900/20" },
    complained: { icon: AlertTriangle, label: "Spam", className: "text-orange-600 bg-orange-50 dark:bg-orange-900/20" },
  };

  const config = statusConfig[status] || statusConfig.sent;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.className}`}>
        <Icon className="h-2.5 w-2.5" />
        {config.label}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {event.recipientEmail}
      </span>
      {event.deliveredAt && (
        <span className="text-[10px] text-muted-foreground">
          · Delivered {new Date(event.deliveredAt).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
        </span>
      )}
      {event.openedAt && (
        <span className="text-[10px] text-muted-foreground">
          · Opened {new Date(event.openedAt).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
        </span>
      )}
    </div>
  );
}

export default function ClientActivityTab({ jobId, leadId, readOnly, clientName, clientPhone, clientEmail }: ClientActivityTabProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.clientActivities.list.useQuery(
    { jobId },
    { enabled: !!jobId }
  );
  const activities = data?.activities || [];

  // Fetch SMS templates from existing system
  const { data: smsTemplates } = trpc.vocphone.templates.list.useQuery();
  // Fetch email templates from existing system
  const { data: emailTemplates } = trpc.crm.emailTemplates.list.useQuery();

  const activeSmsTemplates = useMemo(
    () => (smsTemplates || []).filter((t: any) => t.isActive),
    [smsTemplates]
  );

  const addMut = trpc.clientActivities.add.useMutation({
    onSuccess: () => {
      utils.clientActivities.list.invalidate({ jobId });
      toast.success("Activity added");
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const togglePortalMut = trpc.clientActivities.togglePortalVisible.useMutation({
    onSuccess: () => {
      utils.clientActivities.list.invalidate({ jobId });
    },
  });

  const deleteMut = trpc.clientActivities.delete.useMutation({
    onSuccess: () => {
      utils.clientActivities.list.invalidate({ jobId });
      toast.success("Activity deleted");
    },
  });

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<ActivityType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [portalVisible, setPortalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterType, setFilterType] = useState<ActivityType | "all">("all");

  const resetForm = useCallback(() => {
    setTitle("");
    setContent("");
    setPortalVisible(false);
    setSelectedFile(null);
    setSelectedTemplate("");
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /**
   * Apply merge fields to template body text
   */
  function applyMergeFields(text: string): string {
    const firstName = (clientName || "").split(" ")[0] || "";
    const lastName = (clientName || "").split(" ").slice(1).join(" ") || "";
    return text
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{lastName\}\}/g, lastName)
      .replace(/\{\{fullName\}\}/g, clientName || "")
      .replace(/\{\{clientName\}\}/g, clientName || "")
      .replace(/\{\{phone\}\}/g, clientPhone || "")
      .replace(/\{\{email\}\}/g, clientEmail || "");
  }

  function handleSmsTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    const tmpl = (smsTemplates || []).find((t: any) => t.id === Number(templateId));
    if (tmpl) {
      setContent(applyMergeFields(tmpl.body));
      if (!title) setTitle(tmpl.name);
    }
  }

  function handleEmailTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    const tmpl = (emailTemplates || []).find((t: any) => t.id === Number(templateId));
    if (tmpl) {
      setTitle(applyMergeFields(tmpl.subject));
      setContent(applyMergeFields(tmpl.body));
    }
  }

  const handleSubmit = async () => {
    if (!content && !selectedFile && formType === "note") {
      toast.error("Please enter a note");
      return;
    }
    if ((formType === "sms" || formType === "email") && !content) {
      toast.error(`Please enter ${formType === "sms" ? "SMS" : "email"} content`);
      return;
    }

    let fileData: string | undefined;
    let fileName: string | undefined;
    let fileMimeType: string | undefined;

    if (selectedFile) {
      const buffer = await selectedFile.arrayBuffer();
      fileData = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      fileName = selectedFile.name;
      fileMimeType = selectedFile.type || "application/octet-stream";
    }

    addMut.mutate({
      jobId,
      leadId: leadId ?? undefined,
      type: formType,
      title: title || undefined,
      content: content || undefined,
      portalVisible,
      fileData,
      fileName,
      fileMimeType,
    });
  };

  const filteredActivities = filterType === "all"
    ? activities
    : activities.filter((a: any) => a.type === filterType);

  const getTypeConfig = (type: string) =>
    ACTIVITY_TYPES.find((t) => t.value === type) || ACTIVITY_TYPES[0];

  return (
    <div className="space-y-4">
      {/* Header with filter and add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Filter..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {filteredActivities.length} item{filteredActivities.length !== 1 ? "s" : ""}
          </span>
        </div>
        {!readOnly && (
          <Button size="sm" variant={showForm ? "secondary" : "default"} onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {showForm ? "Cancel" : "Add Activity"}
          </Button>
        )}
      </div>

      {/* Add Activity Form */}
      {showForm && !readOnly && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {ACTIVITY_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <Button
                    key={t.value}
                    variant={formType === t.value ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setFormType(t.value);
                      setSelectedTemplate("");
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1" />
                    {t.label}
                  </Button>
                );
              })}
            </div>

            {/* Template Picker for SMS */}
            {formType === "sms" && activeSmsTemplates.length > 0 && (
              <div className="flex items-center gap-2">
                <BookTemplate className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedTemplate} onValueChange={handleSmsTemplateSelect}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Use SMS template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSmsTemplates.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        <span className="text-xs">{t.name}</span>
                        {t.category && (
                          <span className="ml-2 text-[10px] text-muted-foreground">({t.category})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Template Picker for Email */}
            {formType === "email" && emailTemplates && emailTemplates.length > 0 && (
              <div className="flex items-center gap-2">
                <BookTemplate className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedTemplate} onValueChange={handleEmailTemplateSelect}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Use email template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        <span className="text-xs">{t.subject || t.letterType}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Title field — shown as Subject for email */}
            <Input
              placeholder={formType === "email" ? "Subject" : "Title (optional)"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm"
            />

            <Textarea
              placeholder={
                formType === "note" ? "Write a note..." :
                formType === "sms" ? "SMS message content..." :
                formType === "email" ? "Email body..." :
                "Description..."
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={formType === "email" ? 6 : 3}
              className="text-sm"
            />

            {/* SMS character count */}
            {formType === "sms" && content && (
              <div className="text-xs text-muted-foreground">
                {content.length} characters · {Math.ceil(content.length / 160)} SMS segment{Math.ceil(content.length / 160) !== 1 ? "s" : ""}
              </div>
            )}

            {(formType === "photo" || formType === "file" || formType === "email") && (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={formType === "photo" ? "image/*" : undefined}
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {formType === "email" ? (
                    <><Paperclip className="h-3.5 w-3.5 mr-1" />{selectedFile ? selectedFile.name : "Attach File"}</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5 mr-1" />{selectedFile ? selectedFile.name : `Choose ${formType === "photo" ? "Photo" : "File"}`}</>
                  )}
                </Button>
                {selectedFile && (
                  <span className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="portal-visible"
                  checked={portalVisible}
                  onCheckedChange={setPortalVisible}
                />
                <Label htmlFor="portal-visible" className="text-xs text-muted-foreground cursor-pointer">
                  Include in Client Portal
                </Label>
              </div>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={addMut.isPending}
              >
                {addMut.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</>
                ) : formType === "sms" ? (
                  <><Send className="h-3.5 w-3.5 mr-1" /> Send SMS</>
                ) : formType === "email" ? (
                  <><Send className="h-3.5 w-3.5 mr-1" /> Send Email</>
                ) : (
                  <><Send className="h-3.5 w-3.5 mr-1" /> Save</>
                )}
              </Button>
            </div>

            {/* Dispatch info for SMS/Email */}
            {formType === "sms" && (
              <p className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                SMS will be sent to the client's phone number via VocPhone.
                {clientPhone && <span className="font-medium"> Recipient: {clientPhone}</span>}
              </p>
            )}
            {formType === "email" && (
              <p className="text-[11px] text-muted-foreground bg-rose-50 dark:bg-rose-900/20 p-2 rounded">
                Email will be sent to the client via Resend.
                {clientEmail && <span className="font-medium"> Recipient: {clientEmail}</span>}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No activities recorded yet.
          {!readOnly && " Click \"Add Activity\" to get started."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActivities.map((activity: any) => {
            const config = getTypeConfig(activity.type);
            const Icon = config.icon;
            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className={`p-1.5 rounded-md ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                    {activity.title && (
                      <span className="text-sm font-medium">{activity.title}</span>
                    )}
                    {activity.portalVisible && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Eye className="h-2.5 w-2.5 mr-0.5" /> Portal
                      </Badge>
                    )}
                  </div>
                  {activity.content && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{activity.content}</p>
                  )}
                  {activity.fileUrl && (
                    <a
                      href={activity.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <FileText className="h-3 w-3" />
                      {activity.fileName || "View File"}
                    </a>
                  )}
                  {activity.fileUrl && activity.type === "photo" && (
                    <img
                      src={activity.fileUrl}
                      alt={activity.fileName || "Photo"}
                      className="mt-2 max-h-48 rounded-md border object-cover"
                    />
                  )}
                  {/* Email tracking status */}
                  {activity.type === "email" && (
                    <EmailTrackingBadge activityId={activity.id} />
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span>{activity.createdByName}</span>
                    <span>·</span>
                    <span>{new Date(activity.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={activity.portalVisible ? "Hide from portal" : "Show in portal"}
                      onClick={() =>
                        togglePortalMut.mutate({
                          id: activity.id,
                          portalVisible: !activity.portalVisible,
                        })
                      }
                    >
                      {activity.portalVisible ? (
                        <Eye className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this activity?")) {
                          deleteMut.mutate({ id: activity.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
