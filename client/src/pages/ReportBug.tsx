import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bug, Send, ImagePlus, X, Loader2 } from "lucide-react";

const SCREENS = [
  "App Central / Dashboard",
  "CRM / Leads",
  "CRM / Pipeline",
  "CRM / Calendar",
  "Quotes / List",
  "Quotes / Editor",
  "Quotes / Proposal",
  "Construction / Jobs",
  "Construction / Schedule",
  "Construction / Kanban",
  "Construction / Financials",
  "Chat / Team Chat",
  "Manufacturing / Orders",
  "Manufacturing / Dispatch",
  "Inventory / Stock",
  "Inventory / Procurement",
  "Trade Portal",
  "Trade Portal / Chat",
  "Inbox / Email",
  "Admin / User Management",
  "Admin / Settings",
  "Patio Planner",
  "Plan Converter",
  "Profile / Settings",
  "Other (specify in description)",
];

interface Attachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export default function ReportBug() {
  const [screen, setScreen] = useState("");
  const [action, setAction] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedBehaviour, setExpectedBehaviour] = useState("");
  const [actualBehaviour, setActualBehaviour] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadAttachment = trpc.support.uploadAttachment.useMutation();

  const submitBug = trpc.support.submitBug.useMutation({
    onSuccess: () => {
      toast.success("Bug Report Submitted — Thank you! We'll investigate this issue.");
      setScreen("");
      setAction("");
      setStepsToReproduce("");
      setExpectedBehaviour("");
      setActualBehaviour("");
      setDescription("");
      setPriority("medium");
      setAttachments([]);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_FILES - attachments.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_FILES} attachments allowed.`);
      return;
    }
    const toUpload = fileArray.slice(0, remaining);

    for (const file of toUpload) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Only PNG, JPEG, GIF, and WebP images are accepted.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: File too large. Maximum size is 5MB.`);
        continue;
      }

      setUploading(true);
      try {
        const base64 = await fileToBase64(file);
        const result = await uploadAttachment.mutateAsync({
          filename: file.name,
          mimeType: file.type,
          base64Data: base64,
        });
        setAttachments((prev) => [...prev, result]);
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message || "Unknown error"}`);
      } finally {
        setUploading(false);
      }
    }
  }, [attachments.length, uploadAttachment]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  // Paste from clipboard support (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processFiles]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screen || !action || !stepsToReproduce || !expectedBehaviour || !actualBehaviour) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setIsSubmitting(true);
    await submitBug.mutateAsync({
      screen,
      action,
      stepsToReproduce,
      expectedBehaviour,
      actualBehaviour,
      description: description || undefined,
      priority,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    setIsSubmitting(false);
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 text-red-600">
              <Bug className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl">Report a Bug</CardTitle>
              <CardDescription>Help us fix issues by providing detailed information about what went wrong.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Screen */}
            <div className="space-y-2">
              <Label htmlFor="screen">Which screen were you on? <span className="text-red-500">*</span></Label>
              <Select value={screen} onValueChange={setScreen}>
                <SelectTrigger>
                  <SelectValue placeholder="Select the screen..." />
                </SelectTrigger>
                <SelectContent>
                  {SCREENS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action / Button */}
            <div className="space-y-2">
              <Label htmlFor="action">What button or action triggered the bug? <span className="text-red-500">*</span></Label>
              <Input
                id="action"
                placeholder='e.g. "Clicked Save on the quote editor", "Opened the calendar view"'
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>

            {/* Steps to Reproduce */}
            <div className="space-y-2">
              <Label htmlFor="steps">Steps to reproduce <span className="text-red-500">*</span></Label>
              <Textarea
                id="steps"
                placeholder={"1. Navigate to...\n2. Click on...\n3. Observe that..."}
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                rows={4}
              />
            </div>

            {/* Expected Behaviour */}
            <div className="space-y-2">
              <Label htmlFor="expected">What did you expect to happen? <span className="text-red-500">*</span></Label>
              <Textarea
                id="expected"
                placeholder="The quote should have saved and shown a success message..."
                value={expectedBehaviour}
                onChange={(e) => setExpectedBehaviour(e.target.value)}
                rows={3}
              />
            </div>

            {/* Actual Behaviour */}
            <div className="space-y-2">
              <Label htmlFor="actual">What actually happened? <span className="text-red-500">*</span></Label>
              <Textarea
                id="actual"
                placeholder="The page froze and showed an error message..."
                value={actualBehaviour}
                onChange={(e) => setActualBehaviour(e.target.value)}
                rows={3}
              />
            </div>

            {/* Screenshots */}
            <div className="space-y-2">
              <Label>Screenshots (optional)</Label>
              <p className="text-xs text-muted-foreground">Attach up to {MAX_FILES} screenshots. PNG, JPEG, GIF, or WebP. Max 5MB each.</p>
              
              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                } ${attachments.length >= MAX_FILES ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 py-2">
                    <ImagePlus className="w-8 h-8 text-muted-foreground/60" />
                    <span className="text-sm text-muted-foreground">
                      Drop images here, click to browse, or paste (Ctrl+V)
                    </span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Attachment Previews */}
              {attachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border bg-muted/30">
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="w-full h-24 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <p className="text-[10px] text-muted-foreground truncate px-1.5 py-1">{att.filename}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — Minor inconvenience</SelectItem>
                  <SelectItem value="medium">Medium — Affects workflow</SelectItem>
                  <SelectItem value="high">High — Blocks a key task</SelectItem>
                  <SelectItem value="critical">Critical — System unusable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Additional Details */}
            <div className="space-y-2">
              <Label htmlFor="description">Additional details (optional)</Label>
              <Textarea
                id="description"
                placeholder="Any other context or error messages..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={isSubmitting || uploading} className="w-full">
              <Send className="w-4 h-4 mr-2" />
              {isSubmitting ? "Submitting..." : "Submit Bug Report"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Convert a File to base64 string (without the data:... prefix) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
