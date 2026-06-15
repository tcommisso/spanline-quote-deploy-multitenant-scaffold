import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MessagesSquare, Send, Loader2, Hash, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

interface ChatChannel {
  id: number;
  name: string;
  type: string;
  unreadCount: number;
}

interface ChatMessage {
  id: number;
  channelId: number;
  senderId: number;
  senderName: string;
  content: string;
  createdAt: string | Date;
}

export default function TradePortalChat() {
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels, isLoading: channelsLoading } = trpc.tradePortal.chatListChannels.useQuery(
    undefined,
    { refetchInterval: 5000 }
  );

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } =
    trpc.tradePortal.chatGetMessages.useQuery(
      { channelId: selectedChannelId! },
      { enabled: !!selectedChannelId, refetchInterval: 4000 }
    );

  const sendMessage = trpc.tradePortal.chatSendMessage.useMutation({
    onSuccess: () => {
      setNewMessage("");
      refetchMessages();
    },
    onError: (err) => toast.error(err.message),
  });

  const markRead = trpc.tradePortal.chatMarkRead.useMutation();

  // Mark channel as read when selected
  useEffect(() => {
    if (selectedChannelId) {
      markRead.mutate({ channelId: selectedChannelId });
    }
  }, [selectedChannelId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!newMessage.trim() || !selectedChannelId) return;
    sendMessage.mutate({ channelId: selectedChannelId, content: newMessage.trim() });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const selectedChannel = channels?.find((c: ChatChannel) => c.id === selectedChannelId);

  // Channel list view (mobile-first)
  if (!selectedChannelId) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="hidden sm:block">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Team Chat</h1>
          <p className="text-sm text-muted-foreground">Chat with the construction team and office</p>
        </div>

        {channelsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : channels && channels.length > 0 ? (
          <div className="space-y-2">
            {channels.map((ch: ChatChannel) => (
              <Card
                key={ch.id}
                className="cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setSelectedChannelId(ch.id)}
              >
                <CardContent className="flex items-center gap-3 py-4 px-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Hash className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{ch.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ch.type} channel</p>
                  </div>
                  {ch.unreadCount > 0 && (
                    <Badge variant="default" className="bg-primary text-primary-foreground text-xs">
                      {ch.unreadCount}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <MessagesSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No chat channels available yet.</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Message thread view
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="flex flex-col" style={{ height: "calc(100dvh - 200px)", minHeight: "300px", maxHeight: "calc(100dvh - 140px)" }}>
        <CardHeader className="py-3 px-4 sm:px-6 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedChannelId(null)}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Hash className="w-4 h-4 text-primary" />
              {selectedChannel?.name || "Chat"}
            </CardTitle>
          </div>
        </CardHeader>

        {/* Messages area */}
        <CardContent className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
          {messagesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-1/2 ml-auto" />
            </div>
          ) : messages && messages.length > 0 ? (
            <>
              {messages.map((msg: ChatMessage) => (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[85%] sm:max-w-[75%]">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium text-slate-700">{msg.senderName}</span>
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground">
                        {format(new Date(msg.createdAt), "d MMM, HH:mm")}
                      </span>
                    </div>
                    <div className="rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-sm bg-slate-100 text-slate-800 rounded-tl-md">
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <MessagesSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
              </div>
            </div>
          )}
        </CardContent>

        {/* Input area */}
        <div className="border-t p-3 sm:p-4 shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="resize-none text-sm min-h-[40px] max-h-[100px]"
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMessage.isPending}
              size="icon"
              className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 self-end h-10 w-10"
            >
              {sendMessage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">Enter to send, Shift+Enter for new line</p>
        </div>
      </Card>
    </div>
  );
}
