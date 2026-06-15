import { cn } from "@/lib/utils";
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
import {
  GripVertical,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  RotateCcw,
  Settings2,
  LayoutTemplate,
  Copy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ColourSwatch } from "@/components/ColourSwatch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Section metadata type
export interface SectionMeta {
  id: string;
  label: string;
  category: string;
}



// ─── Sortable Section Item ───────────────────────────────────────────────────
function SortableSectionItem({
  section,
  isActive,
  hasData,
  isHidden,
  onNavigate,
  onToggleHidden,
  editMode,
}: {
  section: SectionMeta;
  isActive: boolean;
  hasData: boolean;
  isHidden: boolean;
  onNavigate: (id: string) => void;
  onToggleHidden: (id: string) => void;
  editMode: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1.5 rounded-md transition-all duration-150",
        isHidden && "opacity-40",
        isActive && !isHidden
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/60 border border-transparent",
        editMode ? "py-1 px-1.5" : "py-1 px-1.5"
      )}
    >
      {/* Drag handle - only in edit mode */}
      {editMode && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Completion indicator */}
      <div className="shrink-0">
        {hasData ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
        )}
      </div>

      {/* Section label - clickable */}
      <button
        type="button"
        onClick={() => !isHidden && onNavigate(section.id)}
        disabled={isHidden}
        className={cn(
          "flex-1 text-left text-[12px] leading-tight truncate transition-colors",
          isActive && !isHidden
            ? "text-primary font-medium"
            : isHidden
              ? "text-muted-foreground/50 line-through"
              : "text-foreground/80 hover:text-foreground"
        )}
      >
        {section.label}
      </button>

      {/* Hide/show toggle - only in edit mode */}
      {editMode && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onToggleHidden(section.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                {isHidden ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {isHidden ? "Show section" : "Hide section"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Main Sidebar Component ──────────────────────────────────────────────────
export interface SectionTemplate {
  id: number;
  name: string;
  description?: string | null;
}

interface QuickSummary {
  width?: string;
  length?: string;
  fall?: string;
  windCat?: string;
  roofArea?: string;
  roofColour?: string;
  postColour?: string;
  beamColour?: string;
  gutterColour?: string;
}

interface SpecSheetSidebarProps {
  sections: SectionMeta[];
  sectionOrder: string[];
  hiddenSections: Set<string>;
  activeSection: string;
  sectionHasData: (id: string) => boolean;
  onNavigate: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
  onToggleHidden: (id: string) => void;
  onResetPreferences: () => void;
  completedCount: number;
  totalVisible: number;
  templates?: SectionTemplate[];
  activeTemplateId?: number | null;
  onApplyTemplate?: (templateId: number) => void;
  onCopyFromQuote?: () => void;
  quickSummary?: QuickSummary;
}

export default function SpecSheetSidebar({
  sections,
  sectionOrder,
  hiddenSections,
  activeSection,
  sectionHasData,
  onNavigate,
  onReorder,
  onToggleHidden,
  onResetPreferences,
  completedCount,
  totalVisible,
  templates,
  activeTemplateId,
  onApplyTemplate,
  onCopyFromQuote,
  quickSummary,
}: SpecSheetSidebarProps) {
  const [editMode, setEditMode] = useState(false);
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sectionOrder.indexOf(active.id as string);
      const newIndex = sectionOrder.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorder(arrayMove(sectionOrder, oldIndex, newIndex));
    },
    [sectionOrder, onReorder]
  );



  // Build ordered sections list
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const orderedSections = sectionOrder
    .map((id) => sectionMap.get(id))
    .filter(Boolean) as SectionMeta[];



  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sections
          </h3>
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editMode ? "default" : "ghost"}
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setEditMode(!editMode)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {editMode ? "Done editing" : "Reorder & hide sections"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {editMode && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={onResetPreferences}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Reset to default order
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${totalVisible > 0 ? (completedCount / totalVisible) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {completedCount}/{totalVisible}
          </span>
        </div>

        {/* Quick Summary Card */}
        {quickSummary && (quickSummary.width || quickSummary.length || quickSummary.fall || quickSummary.windCat) && (
          <div className="bg-muted/50 rounded-md px-2.5 py-2 space-y-1">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {quickSummary.width && quickSummary.length && (
                <div className="col-span-2">
                  <span className="text-[10px] text-muted-foreground">Size</span>
                  <p className="text-xs font-medium">{quickSummary.width} × {quickSummary.length} m</p>
                </div>
              )}
              {quickSummary.roofArea && (
                <div>
                  <span className="text-[10px] text-muted-foreground">Roof</span>
                  <p className="text-xs font-medium">{quickSummary.roofArea}</p>
                </div>
              )}
              {quickSummary.fall && (
                <div>
                  <span className="text-[10px] text-muted-foreground">Fall</span>
                  <p className="text-xs font-medium">{quickSummary.fall}°</p>
                </div>
              )}
              {quickSummary.windCat && (
                <div>
                  <span className="text-[10px] text-muted-foreground">Wind</span>
                  <p className="text-xs font-medium">{quickSummary.windCat}</p>
                </div>
              )}
            </div>
            {/* Colour swatches row */}
            {(quickSummary.roofColour || quickSummary.postColour || quickSummary.beamColour || quickSummary.gutterColour) && (
              <div className="border-t border-border/40 pt-1.5 mt-1">
                <span className="text-[10px] text-muted-foreground block mb-1">Colours</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {quickSummary.roofColour && (
                    <div className="flex items-center gap-1">
                      <ColourSwatch colour={quickSummary.roofColour} size="sm" />
                      <span className="text-[10px] text-muted-foreground">Roof</span>
                    </div>
                  )}
                  {quickSummary.postColour && (
                    <div className="flex items-center gap-1">
                      <ColourSwatch colour={quickSummary.postColour} size="sm" />
                      <span className="text-[10px] text-muted-foreground">Posts</span>
                    </div>
                  )}
                  {quickSummary.beamColour && (
                    <div className="flex items-center gap-1">
                      <ColourSwatch colour={quickSummary.beamColour} size="sm" />
                      <span className="text-[10px] text-muted-foreground">Beams</span>
                    </div>
                  )}
                  {quickSummary.gutterColour && (
                    <div className="flex items-center gap-1">
                      <ColourSwatch colour={quickSummary.gutterColour} size="sm" />
                      <span className="text-[10px] text-muted-foreground">Gutter</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Apply Template selector */}
        {templates && templates.length > 0 && onApplyTemplate && (
          <div className="flex items-center gap-1.5">
            <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Select
              value={activeTemplateId ? String(activeTemplateId) : ""}
              onValueChange={(val) => val && onApplyTemplate(Number(val))}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Apply template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeTemplateId && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                Active
              </Badge>
            )}
          </div>
        )}

        {/* Copy layout from another quote */}
        {onCopyFromQuote && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs justify-start gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={onCopyFromQuote}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy layout from quote...
          </Button>
        )}
      </div>

      {/* Section list - collapsible */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <button
          type="button"
          onClick={() => setSectionsCollapsed(!sectionsCollapsed)}
          className="flex items-center gap-1 w-full px-1.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          {sectionsCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          <span>{totalVisible} sections</span>
        </button>

        {!sectionsCollapsed && (
          <div className="space-y-0.5 mt-0.5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sectionOrder}
                strategy={verticalListSortingStrategy}
              >
                {orderedSections
                  .filter((s) => !hiddenSections.has(s.id))
                  .map((section) => (
                    <SortableSectionItem
                      key={section.id}
                      section={section}
                      isActive={activeSection === section.id}
                      hasData={sectionHasData(section.id)}
                      isHidden={false}
                      onNavigate={onNavigate}
                      onToggleHidden={onToggleHidden}
                      editMode={editMode}
                    />
                  ))}
              </SortableContext>
            </DndContext>

            {/* Hidden sections at bottom */}
            {hiddenSections.size > 0 && (
              <div className="mt-3 pt-2 border-t">
                <p className="text-[10px] text-muted-foreground/60 px-1.5 mb-1">
                  {hiddenSections.size} hidden
                </p>
                {editMode && orderedSections
                  .filter((s) => hiddenSections.has(s.id))
                  .map((section) => (
                    <SortableSectionItem
                      key={section.id}
                      section={section}
                      isActive={false}
                      hasData={sectionHasData(section.id)}
                      isHidden={true}
                      onNavigate={onNavigate}
                      onToggleHidden={onToggleHidden}
                      editMode={editMode}
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
