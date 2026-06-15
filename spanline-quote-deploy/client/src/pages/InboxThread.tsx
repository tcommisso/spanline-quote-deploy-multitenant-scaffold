/**
 * Inbox Thread View — shows all messages in a thread with reply composer
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Mail, MailOpen, Star, StarOff, User, Tag, Clock,
  Send, Paperclip, ChevronDown, ChevronUp, AlertTriangle, AlertCircle,
  UserPlus, X, Check, MoreHorizontal, Eye, EyeOff, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  open: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  replied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  spam: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function InboxThread({ threadId: rawThreadId }: { threadId: string }) {
  const threadId = decodeURIComponent(rawThreadId);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [includeRateUs, setIncludeRateUs] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const { data: thread, isLoading, refetch } = trpc.inbox.getThread.useQuery({ threadId });
  const { data: tags } = trpc.inbox.tags.list.useQuery();
  const { data: staffUsers } = trpc.inbox.staffUsers.useQuery();
  const { data: defaultSig } = trpc.inbox.signatures.getDefault.useQuery();
  const { data: addresses } = trpc.inbox.addresses.list.useQuery();

  const replyMut = trpc.inbox.reply.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyOpen(false);
      setReplyHtml("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMut = trpc.inbox.assign.useMutation({
    onSuccess: () => {
      toast.success("Assigned");
      setAssignDialogOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatusMut = trpc.inbox.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const toggleStarMut = trpc.inbox.toggleStar.useMutation({
    onSuccess: () => refetch(),
  });

  const markReadMut = trpc.inbox.markRead.useMutation({
    onSuccess: () => refetch(),
  });

  const addTagMut = trpc.inbox.tags.addToMessage.useMutation({
    onSuccess: () => { toast.success("Tag added"); refetch(); },
  });

  const removeTagMut = trpc.inbox.tags.removeFromMessage.useMutation({
    onSuccess: () => { toast.success("Tag removed"); refetch(); },
  });

  // Auto-mark as read
  useEffect(() => {
    if (thread && thread.length > 0) {
      const unread = thread.filter((m: any) => !m.isRead && m.direction === "inbound");
      unread.forEach((m: any) => {
        markReadMut.mutate({ ids: [m.id] });
      });
    }
  }, [thread]);

  // Get the first (original) message for context
  const firstMsg = thread?.[0];
  const lastInbound = thread?.filter((m: any) => m.direction === "inbound").slice(-1)[0];
  const latestMsg = thread?.[thread.length - 1];

  function formatDate(date: string | Date) {
    const d = new Date(date);
    return d.toLocaleString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function handleReply() {
    if (!lastInbound && !latestMsg) return;
    const targetMsg = lastInbound || latestMsg;
    if (!targetMsg) return;
    replyMut.mutate({
      inReplyToMessageId: targetMsg.id,
      htmlBody: replyHtml.replace(/\n/g, "<br/>"),
      textBody: replyHtml,
      includeSignature,
      includeRateUs,
    });
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[200px] w-full mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!thread || thread.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Mail className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Thread not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">
            {firstMsg?.subject || "(no subject)"}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`text-xs ${STATUS_COLORS[firstMsg?.status ?? ""] || ""}`}>
              {firstMsg?.status}
            </Badge>
            {firstMsg?.receivedByAddress && (
              <Badge variant="secondary" className="text-xs">
                {(() => {
                  const addr = addresses?.find((a: any) => a.address === firstMsg.receivedByAddress);
                  return addr?.displayName || firstMsg.receivedByAddress;
                })()}
              </Badge>
            )}
            {firstMsg?.assignedToName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> {firstMsg.assignedToName}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {thread.length} message{thread.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => firstMsg && toggleStarMut.mutate({ id: firstMsg.id })}>
            {firstMsg?.isStarred ? (
              <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
            ) : (
              <StarOff className="h-5 w-5 text-muted-foreground/40 hover:text-amber-500" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAssignDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Assign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTagDialogOpen(true)}>
                <Tag className="h-4 w-4 mr-2" /> Manage Tags
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => firstMsg && updateStatusMut.mutate({ id: firstMsg.id, status: "open" })}>
                Mark as Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => firstMsg && updateStatusMut.mutate({ id: firstMsg.id, status: "closed" })}>
                Mark as Closed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => firstMsg && updateStatusMut.mutate({ id: firstMsg.id, status: "spam" })} className="text-red-600">
                Mark as Spam
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Messages */}
      <div className="space-y-4">
        {thread.map((msg: any, idx: number) => (
          <Card key={msg.id} className={`${msg.direction === "outbound" ? "border-l-4 border-l-primary/40" : ""}`}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${msg.direction === "inbound" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"}`}>
                    {msg.direction === "inbound" ? (msg.fromName?.[0] || "?") : (msg.createdByName?.[0] || "S")}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {msg.direction === "inbound" ? (msg.fromName || msg.fromAddress) : (msg.createdByName || "Altaspan Team")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {msg.direction === "inbound" ? msg.fromAddress : `To: ${(() => { try { return JSON.parse(msg.toAddresses)?.[0]; } catch { return msg.toAddresses; } })()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {msg.direction === "outbound" && (
                    <Badge variant="outline" className="text-[10px]">Sent</Badge>
                  )}
                  {msg.autoReplySent && (
                    <Badge variant="secondary" className="text-[10px]">Auto-reply</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {msg.htmlBody ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm [&_img]:max-w-full [&_img]:h-auto"
                  dangerouslySetInnerHTML={{ __html: msg.htmlBody }}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.textBody || "(empty)"}</p>
              )}

              {/* Attachments */}
              {msg.attachments && (() => {
                try {
                  const atts = JSON.parse(typeof msg.attachments === "string" ? msg.attachments : JSON.stringify(msg.attachments));
                  if (atts.length === 0) return null;
                  return (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Paperclip className="h-3 w-3" /> {atts.length} attachment{atts.length !== 1 ? "s" : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {atts.map((att: any, i: number) => (
                          <a
                            key={i}
                            href={att.url || att.storageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs hover:bg-muted/80 transition-colors"
                          >
                            <Paperclip className="h-3 w-3" />
                            {att.filename || att.name || `Attachment ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reply Composer */}
      <div className="mt-6">
        {!replyOpen ? (
          <Button onClick={() => setReplyOpen(true)} className="w-full">
            <Send className="h-4 w-4 mr-2" /> Reply
          </Button>
        ) : (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Reply</p>
                <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Textarea
                ref={replyRef}
                placeholder="Type your reply..."
                value={replyHtml}
                onChange={(e) => setReplyHtml(e.target.value)}
                className="min-h-[120px] mb-3"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="include-sig"
                      checked={includeSignature}
                      onCheckedChange={setIncludeSignature}
                    />
                    <Label htmlFor="include-sig" className="text-xs">Signature</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="include-rateus"
                      checked={includeRateUs}
                      onCheckedChange={setIncludeRateUs}
                    />
                    <Label htmlFor="include-rateus" className="text-xs">Rate Us</Label>
                  </div>
                </div>

                <Button
                  onClick={handleReply}
                  disabled={!replyHtml.trim() || replyMut.isPending}
                >
                  {replyMut.isPending ? "Sending..." : "Send Reply"}
                  <Send className="h-4 w-4 ml-2" />
                </Button>
              </div>

              {includeSignature && (
                <div className="mt-3 pt-3 border-t">
                  {defaultSig ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">Signature: {defaultSig.name}{(defaultSig as any).isCompanyDefault && <span className="ml-1 text-amber-600">(company default)</span>}</p>
                        <a href="/profile" className="text-xs text-primary hover:underline">Manage</a>
                      </div>
                      <div className="text-xs text-muted-foreground max-h-[60px] overflow-hidden" dangerouslySetInnerHTML={{ __html: defaultSig.htmlContent }} />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No default signature. <a href="/profile" className="text-primary hover:underline">Create one</a></p>
                  )}
                </div>
              )}

              {/* Full Reply Preview Dialog */}
              <div className="mt-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      <Eye className="h-4 w-4 mr-2" /> Preview Reply
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Reply Preview</DialogTitle>
                    </DialogHeader>
                    <div className="border rounded-lg p-6 bg-white text-black">
                      <div className="border-b pb-3 mb-4">
                        <p className="text-sm"><span className="font-medium text-muted-foreground">Subject:</span> Re: {firstMsg?.subject || "(no subject)"}</p>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {replyHtml || <span className="text-muted-foreground italic">No message body</span>}
                      </div>
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
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {staffUsers?.map((su: any) => (
              <button
                key={su.id}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left"
                onClick={() => firstMsg && assignMut.mutate({ messageId: firstMsg.id, assignedToId: su.id, assignedToName: su.name })}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {su.name?.[0] || "?"}
                </div>
                <div>
                  <p className="text-sm font-medium">{su.name}</p>
                  <p className="text-xs text-muted-foreground">{su.email}</p>
                </div>
                {firstMsg?.assignedToId === su.id && (
                  <Check className="h-4 w-4 text-primary ml-auto" />
                )}
              </button>
            ))}
            <Separator />
            <button
              className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left text-muted-foreground"
              onClick={() => firstMsg && assignMut.mutate({ messageId: firstMsg.id, assignedToId: null, assignedToName: null })}
            >
              <X className="h-4 w-4" />
              <span className="text-sm">Unassign</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {tags?.map((tag: any) => {
              // Check if this tag is already on the first message
              // We'd need to fetch tags for the message — for now show all tags as toggleable
              return (
                <button
                  key={tag.id}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left"
                  onClick={() => firstMsg && addTagMut.mutate({ messageId: firstMsg.id, tagId: tag.id })}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm">{tag.name}</span>
                  {tag.description && (
                    <span className="text-xs text-muted-foreground ml-auto">{tag.description}</span>
                  )}
                </button>
              );
            })}
            {(!tags || tags.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tags defined. Create tags in Admin &gt; Inbox Settings.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
