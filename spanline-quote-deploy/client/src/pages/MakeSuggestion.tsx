import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lightbulb, Send } from "lucide-react";

const CATEGORIES = [
  { value: "feature", label: "New Feature — Something that doesn't exist yet" },
  { value: "improvement", label: "Improvement — Make an existing feature better" },
  { value: "ui_ux", label: "UI/UX — Layout, design, or usability change" },
  { value: "performance", label: "Performance — Speed or efficiency improvement" },
  { value: "other", label: "Other" },
] as const;

export default function MakeSuggestion() {

  const [category, setCategory] = useState<"feature" | "improvement" | "ui_ux" | "performance" | "other" | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitSuggestion = trpc.support.submitSuggestion.useMutation({
    onSuccess: () => {
      toast.success("Suggestion Submitted — Thank you for your feedback! We'll review it soon.");
      setCategory("");
      setTitle("");
      setDescription("");
      setPriority("medium");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !title || !description) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setIsSubmitting(true);
    await submitSuggestion.mutateAsync({
      category: category as "feature" | "improvement" | "ui_ux" | "performance" | "other",
      title,
      description,
      priority,
    });
    setIsSubmitting(false);
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
              <Lightbulb className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl">Make a Suggestion</CardTitle>
              <CardDescription>Share your ideas to help us improve the system. All suggestions are reviewed.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Category */}
            <div className="space-y-2">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger>
                  <SelectValue placeholder="What type of suggestion is this?" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                placeholder='e.g. "Add bulk export for quotes", "Show weather on construction schedule"'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
              <Textarea
                id="description"
                placeholder={"Describe your suggestion in detail:\n• What problem does it solve?\n• How would it work?\n• Who would benefit from it?"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>How important is this to you?</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Nice to have</SelectItem>
                  <SelectItem value="medium">Would improve my workflow</SelectItem>
                  <SelectItem value="high">Important — I need this regularly</SelectItem>
                  <SelectItem value="critical">Essential — Blocking my work</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Submit */}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              <Send className="w-4 h-4 mr-2" />
              {isSubmitting ? "Submitting..." : "Submit Suggestion"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
