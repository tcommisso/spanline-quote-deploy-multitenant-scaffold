import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Send,
  Pin,
  Paperclip,
  Hash,
  HardHat,
  Users,
  ChevronLeft,
  Image as ImageIcon,
  AtSign,
  UserPlus,
  X,
  Search,
  Shield,
  UserMinus,
  ShieldPlus,
  ShieldMinus,
  MoreVertical,
  Settings,
  Smile,
  Archive,
  Plus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatChannel {
  id: number;
  name: string;
  type: "system" | "team" | "job";
  description: string | null;
  jobId: number | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: number;
  channelId: number;
  senderId: number;
  senderName: string;
  content: string;
  attachments: { url: string; filename: string; mimeType: string; size: number }[] | null;
  mentions: number[] | null;
  isPinned: boolean;
  createdAt: string | Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMessageTime(dateStr: string | Date) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "d MMM h:mm a");
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM yyyy");
}

function getChannelIcon(type: string, name: string) {
  if (name === "Construction Team") return <HardHat className="w-4 h-4" />;
  if (name === "Trades") return <Users className="w-4 h-4" />;
  if (type === "team") return <Users className="w-4 h-4" />;
  return <Hash className="w-4 h-4" />;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function renderMessageContent(content: string, isOwn: boolean) {
  // Split on @mentions pattern: @Name (word chars and spaces after @)
  const mentionRegex = /(@[A-Za-z][A-Za-z\s]*?)(?=\s@|\s[^A-Za-z]|[.,!?;:]|$)/g;
  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={match.index}
        className={`font-semibold ${
          isOwn ? "text-primary-foreground/90 bg-primary-foreground/15" : "text-primary bg-primary/10"
        } rounded px-0.5`}
      >
        {match[1]}
      </span>
    );
    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : content;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TeamChat() {
  const { user } = useAuth();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showMobileChannels, setShowMobileChannels] = useState(true);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [pendingMentions, setPendingMentions] = useState<number[]>([]);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelMemberSearch, setNewChannelMemberSearch] = useState("");
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<number[]>([]);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const { data: channels, refetch: refetchChannels } = trpc.chat.listChannels.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const { data: messages, refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
    { channelId: selectedChannelId!, limit: 100 },
    { enabled: !!selectedChannelId, refetchInterval: 3000 }
  );

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessageInput("");
      refetchMessages();
      refetchChannels();
    },
    onError: (err) => toast.error(err.message),
  });

  const markRead = trpc.chat.markRead.useMutation({
    onSuccess: () => refetchChannels(),
  });

  const pinMessage = trpc.chat.pinMessage.useMutation({
    onSuccess: () => refetchMessages(),
  });

  const uploadAttachment = trpc.chat.uploadAttachment.useMutation();

  const { data: allUsers } = trpc.chat.allUsers.useQuery(undefined, {
    enabled: showMembersPanel || showCreateChannel,
  });

  const addMember = trpc.chat.addMember.useMutation({
    onSuccess: (res) => {
      if (res.alreadyMember) {
        toast.info("Already a member");
      } else {
        toast.success("Member added");
      }
      refetchMembers();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = trpc.chat.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      refetchMembers();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRole = trpc.chat.updateMemberRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Role updated to ${vars.role}`);
      refetchMembers();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetCreateChannelForm = () => {
    setNewChannelName("");
    setNewChannelDescription("");
    setNewChannelMemberSearch("");
    setNewChannelMemberIds([]);
  };

  const createTeamChannel = trpc.chat.createTeamChannel.useMutation({
    onSuccess: (result) => {
      toast.success("Channel created");
      setSelectedChannelId(result.channelId);
      setShowMobileChannels(false);
      setShowCreateChannel(false);
      resetCreateChannelForm();
      refetchChannels();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Reactions ─────────────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState<number | null>(null);
  const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];

  const messageIds = useMemo(() => messages?.map((m: any) => m.id) || [], [messages]);
  const { data: reactions, refetch: refetchReactions } = trpc.chat.getReactions.useQuery(
    { messageIds },
    { enabled: messageIds.length > 0, refetchInterval: 5000 }
  );

  const toggleReaction = trpc.chat.toggleReaction.useMutation({
    onSuccess: () => {
      refetchReactions();
      setShowEmojiPicker(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Group reactions by messageId then emoji
  const reactionsByMessage = useMemo(() => {
    if (!reactions) return {};
    const map: Record<number, Record<string, { count: number; users: string[]; userIds: number[] }>> = {};
    for (const r of reactions) {
      if (!map[r.messageId]) map[r.messageId] = {};
      if (!map[r.messageId][r.emoji]) map[r.messageId][r.emoji] = { count: 0, users: [], userIds: [] };
      map[r.messageId][r.emoji].count++;
      map[r.messageId][r.emoji].users.push(r.userName || "User");
      map[r.messageId][r.emoji].userIds.push(r.userId);
    }
    return map;
  }, [reactions]);

  // ─── Channel Settings ──────────────────────────────────────────────────────
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");

  const updateChannel = trpc.chat.updateChannel.useMutation({
    onSuccess: () => {
      toast.success("Channel updated");
      refetchChannels();
      setShowChannelSettings(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const archiveChannel = trpc.chat.archiveChannel.useMutation({
    onSuccess: () => {
      toast.success("Channel archived");
      setSelectedChannelId(null);
      refetchChannels();
      setShowChannelSettings(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const openChannelSettings = () => {
    if (selectedChannel) {
      setSettingsName(selectedChannel.name);
      setSettingsDescription(selectedChannel.description || "");
      setShowChannelSettings(true);
    }
  };

  // ─── Effects ────────────────────────────────────────────────────────────────

  // Auto-select first channel
  useEffect(() => {
    if (channels?.length && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
      setShowMobileChannels(false);
    }
  }, [channels, selectedChannelId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark as read when selecting a channel
  useEffect(() => {
    if (selectedChannelId) {
      markRead.mutate({ channelId: selectedChannelId });
    }
  }, [selectedChannelId]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  // ─── Members for @mention picker ─────────────────────────────────────────
  const { data: channelMembers, refetch: refetchMembers } = trpc.chat.getMembers.useQuery(
    { channelId: selectedChannelId! },
    { enabled: !!selectedChannelId }
  );

  const filteredMembers = useMemo(() => {
    if (!channelMembers) return [];
    const filtered = channelMembers.filter((m: any) => m.userId !== user?.id);
    if (!mentionFilter) return filtered;
    return filtered.filter((m: any) =>
      (m.userName || "").toLowerCase().includes(mentionFilter.toLowerCase())
    );
  }, [channelMembers, mentionFilter, user?.id]);

  const handleMentionSelect = useCallback((memberId: number, memberName: string) => {
    setPendingMentions(prev => prev.includes(memberId) ? prev : [...prev, memberId]);
    setMessageInput(prev => {
      const atIdx = prev.lastIndexOf("@");
      if (atIdx >= 0) {
        return prev.slice(0, atIdx) + `@${memberName} `;
      }
      return prev + `@${memberName} `;
    });
    setShowMentionPicker(false);
    setMentionFilter("");
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!messageInput.trim() || !selectedChannelId) return;
    sendMessage.mutate({
      channelId: selectedChannelId,
      content: messageInput.trim(),
      mentions: pendingMentions.length > 0 ? pendingMentions : undefined,
    });
    setPendingMentions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showMentionPicker && filteredMembers.length > 0) {
        handleMentionSelect(filteredMembers[0].userId!, filteredMembers[0].userName || "User");
      } else {
        handleSend();
      }
    }
    if (e.key === "Escape" && showMentionPicker) {
      setShowMentionPicker(false);
      setMentionFilter("");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessageInput(val);
    const lastAtIdx = val.lastIndexOf("@");
    if (lastAtIdx >= 0) {
      const afterAt = val.slice(lastAtIdx + 1);
      if (!afterAt.includes(" ")) {
        setShowMentionPicker(true);
        setMentionFilter(afterAt);
      } else {
        setShowMentionPicker(false);
      }
    } else {
      setShowMentionPicker(false);
      setMentionFilter("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannelId) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const attachment = await uploadAttachment.mutateAsync({
          channelId: selectedChannelId,
          filename: file.name,
          mimeType: file.type,
          base64Data: base64,
        });
        sendMessage.mutate({
          channelId: selectedChannelId,
          content: `📎 ${file.name}`,
          attachments: [attachment],
        });
      } catch (err: any) {
        toast.error("Upload failed: " + err.message);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSelectChannel = (channelId: number) => {
    setSelectedChannelId(channelId);
    setShowMobileChannels(false);
  };

  // ─── Message grouping ──────────────────────────────────────────────────────

  const groupedMessages = useMemo(() => {
    if (!messages) return [];
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = "";

    for (const msg of messages) {
      const msgDate = format(new Date(msg.createdAt), "yyyy-MM-dd");
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: String(msg.createdAt), messages: [msg as ChatMessage] });
      } else {
        groups[groups.length - 1].messages.push(msg as ChatMessage);
      }
    }
    return groups;
  }, [messages]);

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);
  const totalUnread = channels?.reduce((sum, c) => sum + c.unreadCount, 0) || 0;
  const systemChannels = channels?.filter((c: ChatChannel) => c.type === "system") || [];
  const teamChannels = channels?.filter((c: ChatChannel) => c.type === "team") || [];
  const jobChannels = channels?.filter((c: ChatChannel) => c.type === "job") || [];
  const selectedNewChannelMembers = useMemo(
    () => (allUsers || []).filter((u: any) => newChannelMemberIds.includes(u.id)),
    [allUsers, newChannelMemberIds]
  );
  const availableNewChannelUsers = useMemo(() => {
    const query = newChannelMemberSearch.trim().toLowerCase();
    if (!query) return [];
    return (allUsers || [])
      .filter((u: any) => u.id !== user?.id)
      .filter((u: any) => !newChannelMemberIds.includes(u.id))
      .filter((u: any) =>
        (u.name || "").toLowerCase().includes(query) ||
        (u.email || "").toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [allUsers, newChannelMemberIds, newChannelMemberSearch, user?.id]);

  const handleCreateTeamChannel = () => {
    const name = newChannelName.trim();
    if (!name) {
      toast.error("Channel name is required");
      return;
    }
    createTeamChannel.mutate({
      name,
      description: newChannelDescription.trim() || undefined,
      memberUserIds: newChannelMemberIds,
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex bg-background overflow-hidden -m-4 sm:-m-6 -mb-20 md:-mb-6" style={{ height: 'calc(100dvh - 56px - 56px)', maxHeight: 'calc(100dvh - 56px - 56px)' }}>
      {/* Mobile: 56px top header + 56px bottom nav = 112px total chrome. Negative margins expand into DashboardLayout padding */}
      {/* Channel List Sidebar */}
      <div
        className={`${
          showMobileChannels ? "flex" : "hidden"
        } md:flex flex-col w-full md:w-72 lg:w-80 border-r border-border bg-muted/30`}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <h2 className="text-lg font-semibold flex-1">Team Chat</h2>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="text-xs">
                {totalUnread}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="New channel"
              onClick={() => setShowCreateChannel(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* System Channels */}
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Channels
            </div>
            {systemChannels
              .map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => handleSelectChannel(channel.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedChannelId === channel.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  {getChannelIcon(channel.type, channel.name)}
                  <span className="truncate flex-1 text-left">{channel.name}</span>
                  {channel.unreadCount > 0 && (
                    <Badge variant="destructive" className="text-xs h-5 min-w-[20px] flex items-center justify-center">
                      {channel.unreadCount}
                    </Badge>
                  )}
                </button>
              ))}

            {/* Team Channels */}
            {teamChannels.length ? (
              <>
                <div className="px-2 py-1 mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Team Channels
                </div>
                {teamChannels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSelectChannel(channel.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedChannelId === channel.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {getChannelIcon(channel.type, channel.name)}
                    <span className="truncate flex-1 text-left">{channel.name}</span>
                    {channel.unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs h-5 min-w-[20px] flex items-center justify-center">
                        {channel.unreadCount}
                      </Badge>
                    )}
                  </button>
                ))}
              </>
            ) : null}

            {/* Job Channels */}
            {jobChannels.length ? (
              <>
                <div className="px-2 py-1 mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Job Channels
                </div>
                {jobChannels
                  .map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannel(channel.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedChannelId === channel.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <Hash className="w-4 h-4 shrink-0" />
                      <span className="truncate flex-1 text-left">{channel.name}</span>
                      {channel.unreadCount > 0 && (
                        <Badge variant="destructive" className="text-xs h-5 min-w-[20px] flex items-center justify-center">
                          {channel.unreadCount}
                        </Badge>
                      )}
                    </button>
                  ))}
              </>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      {/* Message Area */}
      <div
        className={`${
          showMobileChannels ? "hidden" : "flex"
        } md:flex flex-col flex-1 min-w-0`}
      >
        {/* Channel Header */}
        {selectedChannel && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
            <button
              onClick={() => setShowMobileChannels(true)}
              className="md:hidden p-1 hover:bg-muted rounded"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {getChannelIcon(selectedChannel.type, selectedChannel.name)}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{selectedChannel.name}</h3>
              {selectedChannel.description && (
                <p className="text-xs text-muted-foreground truncate">{selectedChannel.description}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={openChannelSettings}
              className="shrink-0 w-8 h-8"
              title="Channel settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMembersPanel(!showMembersPanel)}
              className="shrink-0 gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">{channelMembers?.length || 0}</span>
            </Button>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0 p-4">
          {!selectedChannelId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Select a channel to start chatting</p>
            </div>
          ) : (
            <div className="space-y-1">
              {groupedMessages.map((group, gi) => (
                <div key={gi}>
                  {/* Date header */}
                  <div className="flex items-center gap-3 my-4">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {formatDateHeader(group.date)}
                    </span>
                    <Separator className="flex-1" />
                  </div>

                  {/* Messages */}
                  {group.messages.map((msg, mi) => {
                    const isOwn = msg.senderId === user?.id;
                    const showAvatar =
                      mi === 0 || group.messages[mi - 1].senderId !== msg.senderId;

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 ${showAvatar ? "mt-3" : "mt-0.5"} ${
                          isOwn ? "flex-row-reverse" : ""
                        }`}
                      >
                        {/* Avatar */}
                        {showAvatar ? (
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                              isOwn
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {getInitials(msg.senderName)}
                          </div>
                        ) : (
                          <div className="w-8 shrink-0" />
                        )}

                        {/* Message bubble */}
                        <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
                          {showAvatar && (
                            <div
                              className={`flex items-center gap-2 mb-0.5 ${
                                isOwn ? "flex-row-reverse" : ""
                              }`}
                            >
                              <span className="text-xs font-medium text-foreground">
                                {isOwn ? "You" : msg.senderName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatMessageTime(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          <div
                            className={`group relative px-3 py-2 rounded-lg text-sm ${
                              isOwn
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                            } ${msg.isPinned ? "ring-1 ring-amber-400" : ""}`}
                          >
                            {msg.isPinned && (
                              <Pin className="absolute -top-2 -right-2 w-3 h-3 text-amber-500" />
                            )}
                            <p className="whitespace-pre-wrap break-words">{renderMessageContent(msg.content, isOwn)}</p>

                            {/* Attachments */}
                            {msg.attachments?.map((att, ai) => (
                              <a
                                key={ai}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-1 mt-1 text-xs underline ${
                                  isOwn ? "text-primary-foreground/80" : "text-primary"
                                }`}
                              >
                                {att.mimeType.startsWith("image/") ? (
                                  <ImageIcon className="w-3 h-3" />
                                ) : (
                                  <Paperclip className="w-3 h-3" />
                                )}
                                {att.filename}
                              </a>
                            ))}

                            {/* Actions (on hover) */}
                            <div
                              className={`absolute top-1 ${
                                isOwn ? "left-1" : "right-1"
                              } opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5`}
                            >
                              <button
                                onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                                className="p-0.5 rounded hover:bg-background/20"
                                title="React"
                              >
                                <Smile className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() =>
                                  pinMessage.mutate({ messageId: msg.id, pinned: !msg.isPinned })
                                }
                                className="p-0.5 rounded hover:bg-background/20"
                                title={msg.isPinned ? "Unpin" : "Pin"}
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Emoji picker popover */}
                            {showEmojiPicker === msg.id && (
                              <div className={`absolute ${isOwn ? "left-0" : "right-0"} -bottom-9 z-10 flex items-center gap-0.5 bg-popover border border-border rounded-full px-1.5 py-1 shadow-lg`}>
                                {QUICK_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleReaction.mutate({ messageId: msg.id, emoji })}
                                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-sm"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Reaction badges */}
                          {reactionsByMessage[msg.id] && Object.keys(reactionsByMessage[msg.id]).length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                              {Object.entries(reactionsByMessage[msg.id]).map(([emoji, data]) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction.mutate({ messageId: msg.id, emoji })}
                                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                                    data.userIds.includes(user?.id || 0)
                                      ? "border-primary/50 bg-primary/10 text-primary"
                                      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                                  }`}
                                  title={data.users.join(", ")}
                                >
                                  <span>{emoji}</span>
                                  <span className="font-medium">{data.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Message Input */}
        {selectedChannelId && (
          <div className="p-3 border-t border-border bg-background shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAttachment.isPending}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <div className="flex-1 relative">
                {showMentionPicker && filteredMembers.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto z-50">
                    {filteredMembers.slice(0, 8).map((m: any) => (
                      <button
                        key={m.userId}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(m.userId, m.userName || "User"); }}
                      >
                        <AtSign className="w-3 h-3 text-muted-foreground" />
                        <span>{m.userName || "User"}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  ref={inputRef}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... Use @ to mention"
                  className="w-full"
                  disabled={sendMessage.isPending}
                />
              </div>
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!messageInput.trim() || sendMessage.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Team Channel */}
      <Sheet
        open={showCreateChannel}
        onOpenChange={(open) => {
          setShowCreateChannel(open);
          if (!open) resetCreateChannelForm();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Channel
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div>
              <label className="text-sm font-medium text-foreground">Channel Name</label>
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                className="mt-1"
                placeholder="e.g. Accounts"
                maxLength={255}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                value={newChannelDescription}
                onChange={(e) => setNewChannelDescription(e.target.value)}
                className="mt-1"
                placeholder="Optional"
                maxLength={500}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Members</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={newChannelMemberSearch}
                  onChange={(e) => setNewChannelMemberSearch(e.target.value)}
                  placeholder="Add members..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
              {newChannelMemberSearch && (
                <div className="max-h-40 overflow-y-auto border border-border rounded-md">
                  {availableNewChannelUsers.map((member: any) => (
                    <button
                      key={member.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setNewChannelMemberIds((ids) => [...ids, member.id]);
                        setNewChannelMemberSearch("");
                      }}
                    >
                      <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate">{member.name || member.email}</span>
                      {member.email && <span className="ml-auto truncate text-xs text-muted-foreground">{member.email}</span>}
                    </button>
                  ))}
                  {availableNewChannelUsers.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No users found</p>
                  )}
                </div>
              )}
              <div className="space-y-1">
                {selectedNewChannelMembers.map((member: any) => (
                  <div key={member.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                      {getInitials(member.name || member.email || "User")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{member.name || member.email}</p>
                      {member.email && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setNewChannelMemberIds((ids) => ids.filter((id) => id !== member.id))}
                      title="Remove member"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleCreateTeamChannel}
              disabled={createTeamChannel.isPending || !newChannelName.trim()}
            >
              {createTeamChannel.isPending ? "Creating..." : "Create Channel"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Members Panel - Desktop (right sidebar) */}
      {showMembersPanel && selectedChannelId && (
        <div className="hidden md:flex flex-col w-72 lg:w-80 border-l border-border bg-background">
          {renderMembersContent()}
        </div>
      )}

      {/* Members Panel - Mobile (Sheet drawer) */}
      <Sheet open={showMembersPanel && !isDesktop} onOpenChange={setShowMembersPanel}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Members ({channelMembers?.length || 0})
            </SheetTitle>
          </SheetHeader>
          {selectedChannelId && renderMembersContent()}
        </SheetContent>
      </Sheet>

      {/* Channel Settings Dialog */}
      <Sheet open={showChannelSettings} onOpenChange={setShowChannelSettings}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Channel Settings
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div>
              <label className="text-sm font-medium text-foreground">Channel Name</label>
              <Input
                value={settingsName}
                onChange={(e) => setSettingsName(e.target.value)}
                className="mt-1"
                placeholder="Channel name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                value={settingsDescription}
                onChange={(e) => setSettingsDescription(e.target.value)}
                className="mt-1"
                placeholder="What is this channel about?"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  if (selectedChannelId) {
                    updateChannel.mutate({
                      channelId: selectedChannelId,
                      name: settingsName || undefined,
                      description: settingsDescription || undefined,
                    });
                  }
                }}
                disabled={updateChannel.isPending}
                className="flex-1"
              >
                {updateChannel.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
            <Separator />
            <div className="pt-2">
              <p className="text-sm text-muted-foreground mb-2">
                Archiving a channel hides it from all members. This action can be undone by an admin.
              </p>
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedChannelId && confirm("Are you sure you want to archive this channel?")) {
                    archiveChannel.mutate({ channelId: selectedChannelId, archived: true });
                  }
                }}
                disabled={archiveChannel.isPending}
                className="w-full gap-2"
              >
                <Archive className="w-4 h-4" />
                {archiveChannel.isPending ? "Archiving..." : "Archive Channel"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );

  function renderMembersContent() {
    return (
      <>
        {/* Header (desktop only - mobile uses SheetHeader) */}
        <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Members ({channelMembers?.length || 0})
          </h3>
          <button
            onClick={() => setShowMembersPanel(false)}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add Member Section */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={memberSearchQuery}
              onChange={(e) => setMemberSearchQuery(e.target.value)}
              placeholder="Add a member..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          {memberSearchQuery && (
            <div className="mt-2 max-h-32 overflow-y-auto border border-border rounded-md">
              {allUsers
                ?.filter((u: any) =>
                  ((u.name || "").toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                    (u.email || "").toLowerCase().includes(memberSearchQuery.toLowerCase())) &&
                  !channelMembers?.some((m: any) => m.userId === u.id)
                )
                .slice(0, 5)
                .map((u: any) => (
                  <button
                    key={u.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                    onClick={() => {
                      addMember.mutate({ channelId: selectedChannelId!, userId: u.id });
                      setMemberSearchQuery("");
                    }}
                  >
                    <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate">{u.name || u.email}</span>
                  </button>
                ))}
              {allUsers?.filter((u: any) =>
                ((u.name || "").toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                  (u.email || "").toLowerCase().includes(memberSearchQuery.toLowerCase())) &&
                !channelMembers?.some((m: any) => m.userId === u.id)
              ).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No users found</p>
              )}
            </div>
          )}
        </div>

        {/* Current Members List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {channelMembers?.map((m: any) => (
              <div
                key={m.userId}
                className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 group"
              >
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                  {(m.userName || "U").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.userName || "Unknown"}
                    {m.userId === user?.id && (
                      <span className="text-xs text-muted-foreground ml-1">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {m.role === "admin" && <Shield className="w-3 h-3" />}
                    {m.role}
                  </p>
                </div>
                {m.userId !== user?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 hover:bg-muted rounded transition-opacity">
                        <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {m.role === "member" ? (
                        <DropdownMenuItem
                          onClick={() => updateRole.mutate({ channelId: selectedChannelId!, userId: m.userId, role: "admin" })}
                        >
                          <ShieldPlus className="w-3.5 h-3.5 mr-2" />
                          Promote to Admin
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => updateRole.mutate({ channelId: selectedChannelId!, userId: m.userId, role: "member" })}
                        >
                          <ShieldMinus className="w-3.5 h-3.5 mr-2" />
                          Demote to Member
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => removeMember.mutate({ channelId: selectedChannelId!, userId: m.userId })}
                      >
                        <UserMinus className="w-3.5 h-3.5 mr-2" />
                        Remove from Channel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </>
    );
  }
}
