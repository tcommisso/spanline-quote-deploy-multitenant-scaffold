import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WorkChecklistUnit = "" | "ea" | "LM" | "m" | "m2" | "m3" | "hr" | "day" | "lump";
export type CheckItem = {
  item?: string;
  task?: string;
  checked: boolean;
  notes?: string;
  responsibility?: "" | "By Builder" | "By Client";
  qty?: string | number;
  unit?: WorkChecklistUnit | string;
  productMatch?: string;
};

const WORK_CHECKLIST_UNITS: WorkChecklistUnit[] = ["ea", "LM", "m", "m2", "m3", "hr", "day", "lump"];

function getChecklistLabel(row: CheckItem): string {
  return row.item ?? row.task ?? "";
}

function patchChecklistLabel(row: CheckItem, value: string): CheckItem {
  if (row.task !== undefined && row.item === undefined) return { ...row, task: value };
  return { ...row, item: value };
}

function normalizeChecklistItem(row: CheckItem): CheckItem {
  return {
    ...row,
    checked: !!row.checked,
    notes: row.notes ?? "",
    responsibility: row.responsibility ?? "",
    unit: row.unit || "ea",
    qty: row.qty ?? "",
    productMatch: row.productMatch ?? "",
  };
}

interface SortableChecklistProps {
  label: string;
  items: CheckItem[];
  onChange: (items: CheckItem[]) => void;
  placeholder?: string;
  notesPlaceholder?: string;
  defaultItems?: CheckItem[];
  showResponsibility?: boolean;
  showPricingFields?: boolean;
}

function SortableItem({
  id,
  row,
  index,
  items,
  onChange,
  placeholder,
  notesPlaceholder,
  showResponsibility,
  showPricingFields,
}: {
  id: string;
  row: CheckItem;
  index: number;
  items: CheckItem[];
  onChange: (items: CheckItem[]) => void;
  placeholder: string;
  notesPlaceholder: string;
  showResponsibility: boolean;
  showPricingFields: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 mb-2 p-2 border rounded-md bg-muted/20"
    >
      <button
        type="button"
        className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        checked={row.checked}
        onCheckedChange={(c) => {
          const next = [...items];
          next[index] = { ...next[index], checked: !!c };
          onChange(next);
        }}
        className="mt-1"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <Input
          className="h-7 text-sm"
          placeholder={placeholder}
          value={getChecklistLabel(row)}
          onChange={(e) => {
            const next = [...items];
            next[index] = patchChecklistLabel(next[index], e.target.value);
            onChange(next);
          }}
        />
        {showPricingFields && (
          <div className="grid grid-cols-1 sm:grid-cols-[6rem_6rem_minmax(0,1fr)] gap-1">
            <Input
              className="h-7 text-xs"
              type="number"
              min="0"
              step="0.01"
              placeholder="Qty"
              value={row.qty ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...next[index], qty: e.target.value };
                onChange(next);
              }}
            />
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={row.unit || "ea"}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...next[index], unit: e.target.value };
                onChange(next);
              }}
            >
              {WORK_CHECKLIST_UNITS.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            <Input
              className="h-7 text-xs"
              placeholder="Product match (optional)"
              value={row.productMatch ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...next[index], productMatch: e.target.value };
                onChange(next);
              }}
            />
          </div>
        )}
        <Input
          className="h-7 text-xs text-muted-foreground"
          placeholder={notesPlaceholder}
          value={row.notes ?? ""}
          onChange={(e) => {
            const next = [...items];
            next[index] = { ...next[index], notes: e.target.value };
            onChange(next);
          }}
        />
      </div>
      {showResponsibility && (
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
            <Checkbox
              checked={row.responsibility === "By Builder"}
              onCheckedChange={(c) => {
                const next = [...items];
                next[index] = { ...next[index], responsibility: c ? "By Builder" : "" };
                onChange(next);
              }}
            />
            Builder
          </label>
          <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
            <Checkbox
              checked={row.responsibility === "By Client"}
              onCheckedChange={(c) => {
                const next = [...items];
                next[index] = { ...next[index], responsibility: c ? "By Client" : "" };
                onChange(next);
              }}
            />
            Client
          </label>
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive shrink-0"
        onClick={() => onChange(items.filter((_, i) => i !== index))}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function SortableChecklist({
  label,
  items,
  onChange,
  placeholder = "Item...",
  notesPlaceholder = "Notes (optional)...",
  defaultItems,
  showResponsibility = false,
  showPricingFields = true,
}: SortableChecklistProps) {
  // Generate stable IDs based on index
  const getIds = (list: CheckItem[]) => list.map((_, i) => `sortable-${i}`);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentIds = getIds(items);
      const oldIndex = currentIds.indexOf(active.id as string);
      const newIndex = currentIds.indexOf(over.id as string);
      onChange(arrayMove(items, oldIndex, newIndex));
    }
  };

  const sortableIds = getIds(items);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={() => onChange([...items, normalizeChecklistItem({ item: "", checked: false })])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add Item
        </Button>
      </div>
      {items.length === 0 && defaultItems && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground italic">
            No items selected. Use defaults or add custom items.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onChange(defaultItems.map(normalizeChecklistItem))}
          >
            Load Default Items
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {items.map((row, idx) => (
              <SortableItem
                key={sortableIds[idx]}
                id={sortableIds[idx]}
                row={row}
                index={idx}
                items={items}
                onChange={onChange}
                placeholder={placeholder}
                notesPlaceholder={notesPlaceholder}
                showResponsibility={showResponsibility}
                showPricingFields={showPricingFields}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
