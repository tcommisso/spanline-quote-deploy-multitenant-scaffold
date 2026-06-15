import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Upload, ImageIcon, GripVertical, Settings2, CheckSquare, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Fallback categories used if master data hasn't loaded yet
const FALLBACK_CATEGORIES = [
  "Connection",
  "Roof",
  "Beam",
  "Post",
  "Gutter",
  "Bracket",
  "Gable",
  "Wall",
  "Skylight",
  "General",
];

interface ImageItem {
  id: number;
  code: string;
  name: string;
  category: string;
  imageUrl: string;
  sortOrder: number;
  [key: string]: any;
}

function SortableImageCard({
  img,
  onEdit,
  onDelete,
  isSelectMode,
  isSelected,
  onToggleSelect,
}: {
  img: ImageItem;
  onEdit: (img: ImageItem) => void;
  onDelete: (id: number) => void;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `img-${img.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden group cursor-pointer ${isDragging ? "shadow-xl ring-2 ring-primary" : ""} ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
      onClick={isSelectMode ? () => onToggleSelect(img.id) : undefined}
    >
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {/* Selection checkbox */}
        {isSelectMode && (
          <div className="absolute top-1 left-1 z-20">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(img.id)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {/* Drag handle - hidden in select mode */}
        {!isSelectMode && (
          <button
            {...attributes}
            {...listeners}
            className="absolute top-1 left-1 z-10 p-1 rounded bg-white/80 hover:bg-white shadow-sm cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        <img
          src={img.imageUrl}
          alt={img.name}
          className="object-contain w-full h-full p-2"
          draggable={false}
        />
        {!isSelectMode && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); onEdit(img); }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:text-red-300 hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); onDelete(img.id); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <CardContent className="p-2">
        <p className="text-xs font-medium truncate">{img.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {img.code} · {img.category || "General"}
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminImageLibrary() {
  const { data: images, isLoading } = trpc.planConverter.listProductImages.useQuery();
  const { data: imageCategoryData } = trpc.masterData.getByCategory.useQuery({ category: "image_category" });
  const utils = trpc.useUtils();

  // Dynamic categories from master data, with fallback
  const IMAGE_CATEGORIES = useMemo(() => {
    if (!imageCategoryData || imageCategoryData.length === 0) return FALLBACK_CATEGORIES;
    return imageCategoryData.map(c => c.value);
  }, [imageCategoryData]);

  const uploadMutation = trpc.planConverter.createProductImage.useMutation({
    onSuccess: () => {
      utils.planConverter.listProductImages.invalidate();
      toast.success("Image uploaded");
      setShowUpload(false);
      resetUploadForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.planConverter.updateProductImage.useMutation({
    onSuccess: () => {
      utils.planConverter.listProductImages.invalidate();
      toast.success("Image updated");
      setEditingImage(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.planConverter.deleteProductImage.useMutation({
    onSuccess: () => {
      utils.planConverter.listProductImages.invalidate();
      toast.success("Image deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.planConverter.reorderProductImages.useMutation({
    onSuccess: () => {
      utils.planConverter.listProductImages.invalidate();
    },
    onError: (err) => toast.error(`Reorder failed: ${err.message}`),
  });

  const bulkCategoryMutation = trpc.planConverter.bulkUpdateCategory.useMutation({
    onSuccess: (data) => {
      utils.planConverter.listProductImages.invalidate();
      toast.success(`Moved ${data.count} image${data.count !== 1 ? "s" : ""} to new category`);
      setSelectedIds(new Set());
      setIsSelectMode(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const upsertMasterData = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      utils.masterData.getByCategory.invalidate({ category: "image_category" });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMasterData = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      utils.masterData.getByCategory.invalidate({ category: "image_category" });
    },
    onError: (err) => toast.error(err.message),
  });

  const [showUpload, setShowUpload] = useState(false);
  const [editingImage, setEditingImage] = useState<ImageItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Bulk selection state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTargetCategory, setBulkTargetCategory] = useState<string>("");

  // Manage Categories dialog state
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Upload form state
  const [uploadCode, setUploadCode] = useState("");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [editCode, setEditCode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState("");

  // Local reordered state for optimistic updates
  const [localOrder, setLocalOrder] = useState<ImageItem[] | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- Bulk selection helpers ---
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(displayImages.map((img) => img.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleBulkMove() {
    if (selectedIds.size === 0 || !bulkTargetCategory) return;
    bulkCategoryMutation.mutate({ ids: Array.from(selectedIds), category: bulkTargetCategory });
  }

  // --- Manage Categories helpers ---
  function handleAddCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (IMAGE_CATEGORIES.includes(trimmed)) {
      toast.error("Category already exists");
      return;
    }
    const newSortOrder = (imageCategoryData?.length || IMAGE_CATEGORIES.length);
    upsertMasterData.mutate({
      category: "image_category",
      key: trimmed.toLowerCase().replace(/\s+/g, "_"),
      value: trimmed,
      sortOrder: newSortOrder,
    });
    setNewCategoryName("");
    toast.success(`Category "${trimmed}" added`);
  }

  function handleDeleteCategory(cat: { id: number; value: string }) {
    const imagesInCategory = allImages.filter(img => img.category === cat.value).length;
    if (imagesInCategory > 0) {
      toast.error(`Cannot delete "${cat.value}" — ${imagesInCategory} image${imagesInCategory !== 1 ? "s" : ""} still assigned. Move them first.`);
      return;
    }
    if (!confirm(`Delete category "${cat.value}"?`)) return;
    deleteMasterData.mutate({ id: cat.id });
    toast.success(`Category "${cat.value}" deleted`);
  }

  // --- Standard handlers ---
  function resetUploadForm() {
    setUploadCode("");
    setUploadLabel("");
    setUploadCategory("General");
    setUploadFile(null);
    setUploadPreview(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleUpload() {
    if (!uploadFile || !uploadCode || !uploadLabel) {
      toast.error("Please fill in all fields and select an image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        code: uploadCode,
        name: uploadLabel,
        category: uploadCategory,
        imageBase64: base64,
        fileName: uploadFile.name,
        mimeType: uploadFile.type,
      });
    };
    reader.readAsDataURL(uploadFile);
  }

  function startEdit(img: ImageItem) {
    setEditingImage(img);
    setEditCode(img.code);
    setEditLabel(img.name);
    setEditCategory(img.category || "General");
  }

  function handleUpdate() {
    if (!editingImage) return;
    updateMutation.mutate({
      id: editingImage.id,
      code: editCode,
      name: editLabel,
      category: editCategory,
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this image?")) return;
    deleteMutation.mutate({ id });
  }

  const allImages = (images || []) as ImageItem[];
  const filteredImages = allImages.filter(
    (img) => filterCategory === "all" || img.category === filterCategory
  );

  // Use local order for display if available (optimistic reorder), else use server data
  const displayImages = localOrder
    ? localOrder.filter((img) => filterCategory === "all" || img.category === filterCategory)
    : filteredImages;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const currentList = localOrder || allImages;
      const oldIndex = currentList.findIndex((img) => `img-${img.id}` === active.id);
      const newIndex = currentList.findIndex((img) => `img-${img.id}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(currentList, oldIndex, newIndex);
      setLocalOrder(reordered);
      reorderMutation.mutate({ ids: reordered.map((img) => img.id) });
    },
    [localOrder, allImages, reorderMutation]
  );

  const sortableIds = displayImages.map((img) => `img-${img.id}`);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Image Library</h2>
          <p className="text-sm text-muted-foreground">
            {isSelectMode
              ? "Click images to select them for bulk actions."
              : "Manage product and connection images. Drag to reorder."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isSelectMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              if (isSelectMode) { setSelectedIds(new Set()); setBulkTargetCategory(""); }
            }}
          >
            <CheckSquare className="h-4 w-4 mr-1" />
            {isSelectMode ? "Cancel" : "Select"}
          </Button>
          {!isSelectMode && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowManageCategories(true)}>
                <Settings2 className="h-4 w-4 mr-1" /> Categories
              </Button>
              <Button onClick={() => setShowUpload(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Image
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {isSelectMode && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
          <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0}>Clear</Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Move to:</span>
            <Select value={bulkTargetCategory} onValueChange={setBulkTargetCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={selectedIds.size === 0 || !bulkTargetCategory || bulkCategoryMutation.isPending}
              onClick={handleBulkMove}
            >
              {bulkCategoryMutation.isPending ? "Moving..." : `Move ${selectedIds.size}`}
            </Button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setLocalOrder(null); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {IMAGE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {displayImages.length} image{displayImages.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Image grid with drag-to-reorder */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : displayImages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No images found</p>
          <p className="text-xs mt-1">Upload images to use in proposals and plan views</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {displayImages.map((img) => (
                <SortableImageCard
                  key={img.id}
                  img={img}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(img.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input
                value={uploadCode}
                onChange={(e) => setUploadCode(e.target.value)}
                placeholder="e.g. FLY, BCH, CLIMATEK_V"
              />
              <p className="text-xs text-muted-foreground mt-1">Unique identifier used for lookups</p>
            </div>
            <div>
              <label className="text-sm font-medium">Label</label>
              <Input
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="e.g. Flyover Connection Detail"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Image File</label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadPreview ? (
                  <img src={uploadPreview} alt="Preview" className="max-h-32 mx-auto" />
                ) : (
                  <div className="text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Click to select image</p>
                    <p className="text-xs">PNG, JPG, SVG up to 5MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUpload(false); resetUploadForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingImage && (
              <div className="aspect-video bg-muted rounded flex items-center justify-center">
                <img src={editingImage.imageUrl} alt={editingImage.name} className="max-h-32 object-contain" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Label</label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingImage(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Categories Dialog */}
      <Dialog open={showManageCategories} onOpenChange={setShowManageCategories}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Image Categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add or remove categories used to organise images. Categories with images assigned cannot be deleted.
            </p>

            {/* Add new category */}
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
              />
              <Button size="sm" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {/* Existing categories list */}
            <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
              {(imageCategoryData || []).map((cat) => {
                const count = allImages.filter(img => img.category === cat.value).length;
                return (
                  <div key={cat.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cat.value}</span>
                      <span className="text-xs text-muted-foreground">({count} image{count !== 1 ? "s" : ""})</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleDeleteCategory(cat)}
                      disabled={count > 0}
                      title={count > 0 ? "Move images out of this category first" : "Delete category"}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                );
              })}
              {(!imageCategoryData || imageCategoryData.length === 0) && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No categories in master data yet. The default list is being used.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageCategories(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
