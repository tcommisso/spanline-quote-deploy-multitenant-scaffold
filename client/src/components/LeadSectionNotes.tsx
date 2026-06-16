/**
 * LeadSectionNotes — Reusable multi-entry notes feed for CRM lead sub-tabs.
 * Shows timestamped, user-attributed notes scoped to a specific section.
 * Supports category tags and filtering.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Trash2, Pin, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { isAdminRole } from "@shared/const";

const NOTE_CATEGORIES = [
  { value: "general", label: "General", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "customer_call", label: "Customer Call", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "site_visit", label: "Site Visit", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { value: "pricing", label: "Pricing", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  { value: "design", label: "Design", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  { value: "council", label: "Council", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  { value: "follow_up", label: "Follow Up", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
] as const;

function getCategoryInfo(value: string) {
  return NOTE_CATEGORIES.find(c => c.value === value) || NOTE_CATEGORIES[0];
}

interface LeadSectionNotesProps {
  leadId: number;
  section: string;
  title?: string;
}

export default function LeadSectionNotes({ leadId, section, title = "Notes" }: LeadSectionNotesProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: notes, isLoading } = trpc.crm.notes.list.useQuery({ leadId, section });
  const [newNote, setNewNote] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [filterCategory, setFilterCategory] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    if (filterCategory === "all") return notes;
    return notes.filter((n: any) => (n.category || "general") === filterCategory);
  }, [notes, filterCategory]);

  // Count notes per category for the filter badges
  const categoryCounts = useMemo(() => {
    if (!notes) return {};
    const counts: Record<string, number> = {};
    notes.forEach((n: any) => {
      const cat = n.category || "general";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [notes]);

  const createMut = trpc.crm.notes.create.useMutation({
    onSuccess: () => {
      setNewNote("");
      setNewCategory("general");
      utils.crm.notes.list.invalidate({ leadId, section });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.crm.notes.delete.useMutation({
    onSuccess: () => {
      utils.crm.notes.list.invalidate({ leadId, section });
      toast.success("Note deleted");
    },
  });

  const pinMut = trpc.crm.notes.togglePin.useMutation({
    onSuccess: () => {
      utils.crm.notes.list.invalidate({ leadId, section });
    },
  });

  const updateMut = trpc.crm.notes.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      setEditContent("");
      utils.crm.notes.list.invalidate({ leadId, section });
      toast.success("Note updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!newNote.trim()) return;
    createMut.mutate({ leadId, section, content: newNote.trim(), category: newCategory });
  };

  const startEdit = (note: any) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditCategory(note.category || "general");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = () => {
    if (!editContent.trim() || !editingId) return;
    updateMut.mutate({ id: editingId, content: editContent.trim(), category: editCategory });
  };

  return (
    <div className="space-y-3 mt-4 border-t pt-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      {/* Add note input with category selector */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newNote.trim() || createMut.isPending}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {NOTE_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Press Ctrl+Enter to submit</span>
        </div>
      </div>

      {/* Category filter pills */}
      {notes && notes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilterCategory("all")}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              filterCategory === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All ({notes.length})
          </button>
          {NOTE_CATEGORIES.filter(cat => categoryCounts[cat.value]).map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                filterCategory === cat.value
                  ? "bg-foreground text-background"
                  : `${cat.color} hover:opacity-80`
              }`}
            >
              {cat.label} ({categoryCounts[cat.value]})
            </button>
          ))}
        </div>
      )}

      {/* Notes feed */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading notes...</p>}
      {notes && notes.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No notes yet.</p>
      )}
      {filteredNotes.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredNotes.map((note: any) => {
            const catInfo = getCategoryInfo(note.category || "general");
            return (
              <div key={note.id} className={`border rounded-md p-3 ${note.pinned ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {note.pinned && <Pin className="h-3 w-3 text-amber-600" />}
                    <span className="text-xs font-semibold">{note.userName}</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${catInfo.color}`}>
                      {catInfo.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {editingId !== note.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 w-6 p-0 ${note.pinned ? "text-amber-600" : "text-muted-foreground hover:text-amber-600"}`}
                          onClick={() => pinMut.mutate({ id: note.id, pinned: !note.pinned })}
                          title={note.pinned ? "Unpin" : "Pin to top"}
                        >
                          <Pin className="h-3 w-3" />
                        </Button>
                        {(isAdminRole(user?.role || "") || user?.id === note.userId) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                              onClick={() => startEdit(note)}
                              title="Edit note"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(note.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          saveEdit();
                        }
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Select value={editCategory} onValueChange={setEditCategory}>
                        <SelectTrigger className="h-7 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTE_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={saveEdit} disabled={updateMut.isPending}>
                        <Check className="h-3 w-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelEdit}>
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {filteredNotes.length === 0 && notes && notes.length > 0 && (
        <p className="text-sm text-muted-foreground italic">No notes in this category.</p>
      )}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) { deleteMut.mutate({ id: deleteTarget }); setDeleteTarget(null); } }}
        title="Delete Note?"
        description="This will permanently remove this note."
      />
    </div>
  );
}
