/**
 * QuoteNotesSection — Multi-entry notes feed for individual quotes.
 * Shows timestamped, user-attributed notes with pin/delete actions.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Pin } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { isAdminRole } from "@shared/const";

interface QuoteNotesSectionProps {
  quoteId: number;
  quoteType: "structure" | "deck" | "eclipse";
}

export default function QuoteNotesSection({ quoteId, quoteType }: QuoteNotesSectionProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: notes, isLoading } = trpc.crm.quoteNotes.list.useQuery({ quoteId, quoteType });
  const [newNote, setNewNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const createMut = trpc.crm.quoteNotes.create.useMutation({
    onSuccess: () => {
      setNewNote("");
      utils.crm.quoteNotes.list.invalidate({ quoteId, quoteType });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.crm.quoteNotes.delete.useMutation({
    onSuccess: () => {
      utils.crm.quoteNotes.list.invalidate({ quoteId, quoteType });
      toast.success("Note deleted");
    },
  });

  const pinMut = trpc.crm.quoteNotes.togglePin.useMutation({
    onSuccess: () => {
      utils.crm.quoteNotes.list.invalidate({ quoteId, quoteType });
    },
  });

  const handleSubmit = () => {
    if (!newNote.trim()) return;
    createMut.mutate({ quoteId, quoteType, content: newNote.trim() });
  };

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quote Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add note input */}
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note about this quote..."
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
        <p className="text-xs text-muted-foreground">Press Ctrl+Enter to submit</p>

        {/* Notes feed */}
        {isLoading && <p className="text-sm text-muted-foreground">Loading notes...</p>}
        {notes && notes.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No notes yet.</p>
        )}
        {notes && notes.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {notes.map((note: any) => (
              <div key={note.id} className={`border rounded-md p-3 ${note.pinned ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {note.pinned && <Pin className="h-3 w-3 text-amber-600" />}
                    <span className="text-xs font-semibold">{note.userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(note.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    <ConfirmDeleteDialog
      open={deleteTarget !== null}
      onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      onConfirm={() => { if (deleteTarget) { deleteMut.mutate({ id: deleteTarget }); setDeleteTarget(null); } }}
      title="Delete Note?"
      description="This will permanently remove this note."
    />
    </>
  );
}
