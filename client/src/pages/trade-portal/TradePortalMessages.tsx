import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, User, Building2 } from "lucide-react";

export default function TradePortalMessages() {
  const { data: messages, isLoading, refetch } = trpc.tradePortal.getMessages.useQuery();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sendMessage = trpc.tradePortal.sendMessage.useMutation({
    onSuccess: () => {
      setNewMessage("");
      refetch();
      toast.success("Message sent");
    },
    onError: (err) => toast.error(err.message),
  });

  const markRead = trpc.tradePortal.markMessagesRead.useMutation();

  useEffect(() => {
    if (messages && messages.some(m => m.direction === "outbound" && !m.readAt)) {
      markRead.mutate();
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!newMessage.trim()) return;
    sendMessage.mutate({ content: newMessage.trim() });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 sm:h-96" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="hidden sm:block">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Messages</h1>
        <p className="text-sm text-muted-foreground">Send and receive messages with the office</p>
      </div>

      <Card className="flex flex-col" style={{ height: "calc(100dvh - 200px)", minHeight: "300px", maxHeight: "calc(100dvh - 140px)" }}>
        {/* Uses dvh to account for mobile browser chrome and bottom nav */}
        <CardHeader className="py-3 px-4 sm:px-6 border-b shrink-0">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Office Chat
          </CardTitle>
        </CardHeader>

        {/* Messages area */}
        <CardContent className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
          {messages && messages.length > 0 ? (
            <>
              {messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] sm:max-w-[75%]`}>
                      <div className={`flex items-center gap-1.5 mb-0.5 ${isOutbound ? "justify-end" : ""}`}>
                        {!isOutbound && (
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <Building2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-600" />
                          </div>
                        )}
                        <span className="text-[9px] sm:text-[10px] text-muted-foreground">
                          {isOutbound ? "You" : "Office"} · {new Date(msg.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isOutbound && (
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                          </div>
                        )}
                      </div>
                      <div className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-sm ${
                        isOutbound
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-slate-100 text-slate-800 rounded-bl-md"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                      {msg.jobId && (
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 px-2">
                          Re: Job #{msg.jobId}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet.<br />Send a message to the office below.</p>
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
