import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquarePlus, X, Trash2, GripVertical } from "lucide-react";

export interface Annotation {
  id: string;
  x: number; // percentage from left (0-100)
  y: number; // percentage from top (0-100)
  text: string;
  color?: string;
}

interface DiagramAnnotationProps {
  annotations: Annotation[];
  onChange: (annotations: Annotation[]) => void;
  readOnly?: boolean;
  children: React.ReactNode;
}

const COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#22c55e" },
  { label: "Orange", value: "#f97316" },
  { label: "Purple", value: "#a855f7" },
];

export default function DiagramAnnotation({ annotations, onChange, readOnly = false, children }: DiagramAnnotationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAnnotating || readOnly) return;
    if ((e.target as HTMLElement).closest("[data-annotation]")) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newAnnotation: Annotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      x,
      y,
      text: "",
      color: selectedColor,
    };

    onChange([...annotations, newAnnotation]);
    setEditingId(newAnnotation.id);
    setEditText("");
  }, [isAnnotating, readOnly, annotations, onChange, selectedColor]);

  const handleSaveEdit = useCallback((id: string) => {
    if (!editText.trim()) {
      // Remove empty annotation
      onChange(annotations.filter(a => a.id !== id));
    } else {
      onChange(annotations.map(a => a.id === id ? { ...a, text: editText } : a));
    }
    setEditingId(null);
    setEditText("");
  }, [editText, annotations, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(annotations.filter(a => a.id !== id));
    setEditingId(null);
  }, [annotations, onChange]);

  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    if (readOnly) return;
    e.stopPropagation();
    setDraggingId(id);

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const handleMove = (moveEvent: MouseEvent) => {
      const x = Math.max(0, Math.min(100, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((moveEvent.clientY - rect.top) / rect.height) * 100));
      onChange(annotations.map(a => a.id === id ? { ...a, x, y } : a));
    };

    const handleUp = () => {
      setDraggingId(null);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [readOnly, annotations, onChange]);

  return (
    <div className="relative">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-2 mb-2">
          <Button
            type="button"
            variant={isAnnotating ? "default" : "outline"}
            size="sm"
            onClick={() => setIsAnnotating(!isAnnotating)}
            className="gap-1.5"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {isAnnotating ? "Done Annotating" : "Add Notes"}
          </Button>
          {isAnnotating && (
            <>
              <span className="text-xs text-muted-foreground">Click on diagram to place a note</span>
              <div className="flex gap-1 ml-auto">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${selectedColor === c.value ? "scale-125 border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setSelectedColor(c.value)}
                    title={c.label}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Diagram container with annotation overlay */}
      <div
        ref={containerRef}
        className={`relative ${isAnnotating ? "cursor-crosshair" : ""}`}
        onClick={handleContainerClick}
      >
        {/* The actual diagram */}
        {children}

        {/* Annotation markers */}
        {annotations.map(ann => (
          <div
            key={ann.id}
            data-annotation
            className={`absolute z-10 ${draggingId === ann.id ? "opacity-70" : ""}`}
            style={{
              left: `${ann.x}%`,
              top: `${ann.y}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            {editingId === ann.id ? (
              <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-2 min-w-[180px]" onClick={e => e.stopPropagation()}>
                <Input
                  autoFocus
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleSaveEdit(ann.id);
                    if (e.key === "Escape") {
                      if (!ann.text) handleDelete(ann.id);
                      else setEditingId(null);
                    }
                  }}
                  placeholder="Type note..."
                  className="h-7 text-xs"
                />
                <div className="flex justify-between mt-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleDelete(ann.id)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                  <Button type="button" size="sm" className="h-6 px-2 text-xs" onClick={() => handleSaveEdit(ann.id)}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="group flex items-start gap-0.5">
                {!readOnly && (
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 -ml-4"
                    onMouseDown={e => handleDragStart(e, ann.id)}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                <div
                  className={`relative ${!readOnly ? "cursor-pointer" : ""}`}
                  onClick={e => {
                    e.stopPropagation();
                    if (!readOnly) {
                      setEditingId(ann.id);
                      setEditText(ann.text);
                    }
                  }}
                >
                  {/* Pin marker */}
                  <div
                    className="w-4 h-4 rounded-full border-2 border-white shadow-md mx-auto"
                    style={{ backgroundColor: ann.color || COLORS[0].value }}
                  />
                  {/* Note text */}
                  {ann.text && (
                    <div
                      className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap max-w-[150px] truncate shadow-sm border"
                      style={{
                        backgroundColor: `${ann.color || COLORS[0].value}15`,
                        borderColor: `${ann.color || COLORS[0].value}40`,
                        color: ann.color || COLORS[0].value,
                      }}
                    >
                      {ann.text}
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 p-0.5"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(ann.id);
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
