import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { X, Send, Loader2, User, BookOpen, ExternalLink, ArrowDown, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import { useIsMobile } from "@/hooks/useMobile";
import { EnginiAvatar } from "@/components/EnginiAvatar";

const STORAGE_KEY = "engini-chat-history";
const POSITION_KEY = "engini-launcher-position";
const LAUNCHER_SIZE = 56;
const EDGE_GAP = 12;

interface Message {
  role: "user" | "assistant";
  content: string;
  feedbackGiven?: "positive" | "negative" | null;
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: `Hi, I am **Engini**, your technical knowledge specialist! I can help with:

- **Engineering** — beam spans, roof sheeting, post selection, footings, wind classes
- **Pricing** — markups, regional rates, product costs
- **Components** — quantities, specifications, materials
- **Assembly & Diagrams** — connection methods, installation guidance, technical diagrams

Try: *"What's the max span for a 150x60 beam at N2?"*`,
};

const SUGGESTED_PROMPTS = [
  "Double-U roof coverage width?",
  "Max span for 150x60 beam N2?",
  "Flyover bracket connection method?",
  "Rafter strengthening details",
];

// Load messages from localStorage
function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore parse errors
  }
  return [INITIAL_MESSAGE];
}

// Save messages to localStorage
function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore quota errors
  }
}

// Feedback buttons for assistant messages
function FeedbackButtons({ messageIndex, feedbackGiven, onFeedback }: {
  messageIndex: number;
  feedbackGiven: "positive" | "negative" | null;
  onFeedback: (rating: "positive" | "negative") => void;
}) {
  if (feedbackGiven) {
    return (
      <div className="flex items-center gap-1 mt-1 pt-1 border-t border-border/30">
        <span className="text-[9px] text-muted-foreground">
          {feedbackGiven === "positive" ? "👍 Thanks!" : "👎 Noted, we'll improve"}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mt-1 pt-1 border-t border-border/30">
      <button
        onClick={(e) => { e.stopPropagation(); onFeedback("positive"); }}
        className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        title="Good response"
      >
        <ThumbsUp className="h-3 w-3 text-muted-foreground hover:text-green-600" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onFeedback("negative"); }}
        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        title="Bad response"
      >
        <ThumbsDown className="h-3 w-3 text-muted-foreground hover:text-red-600" />
      </button>
    </div>
  );
}

function clampLauncherPosition(position: { x: number; y: number }) {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(Math.max(position.x, EDGE_GAP), Math.max(EDGE_GAP, window.innerWidth - LAUNCHER_SIZE - EDGE_GAP)),
    y: Math.min(Math.max(position.y, EDGE_GAP), Math.max(EDGE_GAP, window.innerHeight - LAUNCHER_SIZE - EDGE_GAP)),
  };
}

function getDefaultLauncherPosition() {
  if (typeof window === "undefined") return { x: EDGE_GAP, y: EDGE_GAP };
  const stored = window.localStorage.getItem(POSITION_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
        return clampLauncherPosition(parsed);
      }
    } catch {
      window.localStorage.removeItem(POSITION_KEY);
    }
  }
  const bottomOffset = window.innerWidth < 768 ? 80 : 24;
  return clampLauncherPosition({
    x: window.innerWidth - LAUNCHER_SIZE - 24,
    y: window.innerHeight - LAUNCHER_SIZE - bottomOffset,
  });
}

export function FloatingAIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [launcherPosition, setLauncherPosition] = useState(getDefaultLauncherPosition);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const isMobile = useIsMobile();

  // Fetch technical library documents dynamically
  const { data: techDocs } = trpc.techLibrary.listActive.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });

  const askMutation = trpc.assistant.askPricing.useMutation({
    onSuccess: (data: { answer: string }) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    },
  });

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    const handleResize = () => {
      setLauncherPosition((current) => {
        const next = clampLauncherPosition(current);
        window.localStorage.setItem(POSITION_KEY, JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Get the scroll viewport element
  const getViewport = useCallback(() => {
    if (!scrollRef.current) return null;
    return scrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;
  }, []);

  // Check if user has scrolled up
  const checkScrollPosition = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 100);
  }, [getViewport]);

  // Attach scroll listener to viewport
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;
    viewport.addEventListener("scroll", checkScrollPosition);
    return () => viewport.removeEventListener("scroll", checkScrollPosition);
  }, [isOpen, getViewport, checkScrollPosition]);

  // Scroll to bottom when messages change (only if already near bottom)
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Auto-scroll if user is near bottom (within 150px)
    if (distanceFromBottom < 150 || messages.length <= 2) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages, askMutation.isPending, getViewport]);

  // Focus textarea when chat opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const scrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, [getViewport]);

  const handleSend = useCallback(() => {
    if (!input.trim() || askMutation.isPending) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    askMutation.mutate({ question: userMsg });
  }, [input, askMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (prompt: string) => {
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    askMutation.mutate({ question: prompt });
  };

  const feedbackMutation = trpc.aiLearning.feedback.submit.useMutation({
    onError: () => { /* silent fail for feedback */ },
  });

  // State for the negative feedback comment dialog
  const [feedbackDialog, setFeedbackDialog] = useState<{ open: boolean; messageIndex: number | null }>({ open: false, messageIndex: null });
  const [feedbackComment, setFeedbackComment] = useState("");

  const handleFeedback = (messageIndex: number, rating: "positive" | "negative") => {
    if (rating === "negative") {
      setFeedbackDialog({ open: true, messageIndex });
      setFeedbackComment("");
      return;
    }
    submitFeedback(messageIndex, "positive", undefined);
  };

  const submitFeedback = (messageIndex: number, rating: "positive" | "negative", comment: string | undefined) => {
    let userQuery = "";
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") { userQuery = messages[i].content; break; }
    }
    const assistantContent = messages[messageIndex].content;
    setMessages(prev => prev.map((m, idx) => idx === messageIndex ? { ...m, feedbackGiven: rating } : m));
    feedbackMutation.mutate({ rating, userQuery, messageContent: assistantContent, comment, promptKey: "engini" });
  };

  const handleFeedbackDialogSubmit = () => {
    if (feedbackDialog.messageIndex !== null) {
      submitFeedback(feedbackDialog.messageIndex, "negative", feedbackComment.trim() || undefined);
    }
    setFeedbackDialog({ open: false, messageIndex: null });
    setFeedbackComment("");
  };

  const handleFeedbackDialogSkip = () => {
    if (feedbackDialog.messageIndex !== null) {
      submitFeedback(feedbackDialog.messageIndex, "negative", undefined);
    }
    setFeedbackDialog({ open: false, messageIndex: null });
    setFeedbackComment("");
  };

  const handleClearHistory = () => {
    setMessages([INITIAL_MESSAGE]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleLauncherPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: launcherPosition.x,
      originY: launcherPosition.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLauncherPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    setLauncherPosition(clampLauncherPosition({ x: drag.originX + dx, y: drag.originY + dy }));
  };

  const handleLauncherPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressClickRef.current = true;
      const next = clampLauncherPosition(launcherPosition);
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(next));
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
  };

  const activeDocs = techDocs ?? [];

  return (
    <>
      {/* Floating Action Button — Engini avatar */}
      {!isOpen && (
        <button
          onClick={() => {
            if (suppressClickRef.current) return;
            if (isMobile && navigator.vibrate) navigator.vibrate(10);
            setIsOpen(true);
          }}
          onPointerDown={handleLauncherPointerDown}
          onPointerMove={handleLauncherPointerMove}
          onPointerUp={handleLauncherPointerUp}
          onPointerCancel={handleLauncherPointerUp}
          style={{ left: launcherPosition.x, top: launcherPosition.y }}
          className={cn(
            "fixed z-[90] h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center justify-center group overflow-hidden border-2 border-amber-400 cursor-grab active:cursor-grabbing touch-none"
          )}
          aria-label="Open Engini. Drag to reposition."
          title="Open Engini. Drag to move."
        >
          <EnginiAvatar size="lg" />
          {/* Pulse indicator */}
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className={cn(
          "fixed rounded-2xl border bg-card text-card-foreground shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200",
          isMobile
            ? "z-[60] inset-0 rounded-none max-w-none w-screen h-[100dvh]"
            : "z-50 bottom-6 right-6 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-4rem)]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <EnginiAvatar size="md" />
              <div>
                <h3 className="text-sm font-semibold leading-tight">Engini</h3>
                <p className="text-[10px] text-muted-foreground">Technical Knowledge Specialist</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleClearHistory}
                  title="Clear chat history"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowLibrary(!showLibrary)}
                title="Technical Library"
              >
                <BookOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Technical Library Panel */}
          {showLibrary && (
            <div className="border-b bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Technical Library</p>
              {activeDocs.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">No documents available yet.</p>
              ) : (
                <>
                  {activeDocs.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 transition-colors shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{doc.title}</p>
                        <p className="text-[10px] text-muted-foreground">{doc.code}{doc.updatedLabel ? ` · Updated ${doc.updatedLabel}` : ""}</p>
                      </div>
                    </a>
                  ))}
                  <p className="text-[10px] text-muted-foreground mt-2 italic">Opens in new tab for viewing</p>
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-hidden relative">
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-3 p-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="shrink-0 mt-1">
                        <EnginiAvatar size="sm" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:text-xs [&_li]:text-xs [&_strong]:text-xs [&_em]:text-xs">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.role === "assistant" && i > 0 && (
                        <FeedbackButtons
                          messageIndex={i}
                          feedbackGiven={msg.feedbackGiven || null}
                          onFeedback={(rating) => handleFeedback(i, rating)}
                        />
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {askMutation.isPending && (
                  <div className="flex gap-2">
                    <div className="shrink-0">
                      <EnginiAvatar size="sm" />
                    </div>
                    <div className="bg-muted rounded-xl px-3 py-2">
                      <div className="flex gap-1 items-center">
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggested prompts (only show when just the initial message) */}
                {messages.length === 1 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handlePromptClick(prompt)}
                        disabled={askMutation.isPending}
                        className="text-[10px] px-2.5 py-1.5 rounded-full border border-border bg-card hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Scroll to bottom button */}
            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform animate-in fade-in zoom-in duration-200"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className={cn(
              "flex gap-2 p-3 border-t bg-background/50 items-end",
              isMobile && "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
            )}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Engini about engineering, pricing..."
              className="flex-1 max-h-20 resize-none min-h-[36px] text-xs"
              rows={1}
              disabled={askMutation.isPending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || askMutation.isPending}
              className="shrink-0 h-[36px] w-[36px] bg-amber-500 hover:bg-amber-600 text-white"
            >
              {askMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </form>
        </div>
      )}

      {/* Negative feedback comment dialog */}
      <Dialog open={feedbackDialog.open} onOpenChange={(open) => { if (!open) handleFeedbackDialogSkip(); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-red-500" />
              What was wrong with this response?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="e.g. The span value was incorrect — it should be 4.5m not 6m..."
              className="min-h-[80px] text-sm"
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Your feedback helps us improve Engini's accuracy. Optional but very helpful.
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={handleFeedbackDialogSkip}>
              Skip
            </Button>
            <Button size="sm" onClick={handleFeedbackDialogSubmit} className="bg-red-600 hover:bg-red-700 text-white">
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
