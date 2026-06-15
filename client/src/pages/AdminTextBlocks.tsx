import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Image as ImageIcon, FileText, GripVertical } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Engineering", "Specifications"] as const;
type Category = typeof CATEGORIES[number];

export default function AdminTextBlocks() {

  const [activeTab, setActiveTab] = useState<Category>("Engineering");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageBlockId, setImageBlockId] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("Engineering");
  const [imageUrl, setImageUrl] = useState("");

  const utils = trpc.useUtils();
  const { data: blocks = [], isLoading } = trpc.textBlocks.list.useQuery({ category: activeTab });
  const { data: allImages = [] } = trpc.emailImages.list.useQuery(undefined, { enabled: imageDialogOpen });

  const createMutation = trpc.textBlocks.create.useMutation({
    onSuccess: () => {
      utils.textBlocks.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("Text block created");
    },
  });

  const updateMutation = trpc.textBlocks.update.useMutation({
    onSuccess: () => {
      utils.textBlocks.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("Text block updated");
    },
  });

  const deleteMutation = trpc.textBlocks.delete.useMutation({
    onSuccess: () => {
      utils.textBlocks.list.invalidate();
      toast.success("Text block archived");
    },
  });

  const associateImageMutation = trpc.textBlocks.associateImage.useMutation({
    onSuccess: () => {
      utils.textBlocks.list.invalidate();
      setImageDialogOpen(false);
      setImageBlockId(null);
      toast.success("Image associated");
    },
  });

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory(activeTab);
    setImageUrl("");
    setEditingBlock(null);
  }

  function openCreate() {
    resetForm();
    setCategory(activeTab);
    setDialogOpen(true);
  }

  function openEdit(block: any) {
    setEditingBlock(block);
    setTitle(block.title);
    setContent(block.content);
    setCategory(block.category);
    setImageUrl(block.imageUrl || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    if (editingBlock) {
      updateMutation.mutate({
        id: editingBlock.id,
        title,
        content,
        category,
        imageUrl: imageUrl || null,
      });
    } else {
      createMutation.mutate({
        title,
        content,
        category,
        imageUrl: imageUrl || null,
        imageKey: null,
      });
    }
  }

  function openImagePicker(blockId: number) {
    setImageBlockId(blockId);
    setImageDialogOpen(true);
  }

  function selectImage(url: string) {
    if (imageBlockId) {
      associateImageMutation.mutate({ id: imageBlockId, imageUrl: url, imageKey: null });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Text Blocks</h1>
          <p className="text-muted-foreground text-sm">
            Manage reusable text blocks for Documentation A3 pages. Categorised by Engineering and Specifications.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Text Block
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Category)}>
        <TabsList>
          <TabsTrigger value="Engineering">Engineering</TabsTrigger>
          <TabsTrigger value="Specifications">Specifications</TabsTrigger>
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat} value={cat}>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : blocks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No text blocks in this category yet.
              </div>
            ) : (
              <div className="space-y-3">
                {blocks.map((block) => (
                  <Card key={block.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex items-center pt-1 text-muted-foreground cursor-grab">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        {block.imageUrl && (
                          <img
                            src={block.imageUrl}
                            alt={block.title}
                            className="w-16 h-16 object-contain rounded border"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{block.title}</h3>
                            <Badge variant="secondary" className="text-xs">{block.category}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{block.content}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Associate Image"
                            onClick={() => openImagePicker(block.id)}
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(block)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Archive this text block?")) {
                                deleteMutation.mutate({ id: block.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBlock ? "Edit Text Block" : "New Text Block"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wind Load Requirements" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter the text block content..."
                rows={6}
              />
            </div>
            <div>
              <Label>Image URL (optional)</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Paste image URL or use Image Library picker"
              />
              {imageUrl && (
                <img src={imageUrl} alt="Preview" className="mt-2 w-20 h-20 object-contain rounded border" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingBlock ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Picker Dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Image from Library</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3">
            {allImages.map((img: any) => (
              <button
                key={img.id}
                onClick={() => selectImage(img.url)}
                className="border rounded-lg p-2 hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <img src={img.url} alt={img.name || "Image"} className="w-full h-20 object-contain" />
                <p className="text-xs text-center mt-1 truncate">{img.name || "Untitled"}</p>
              </button>
            ))}
            {allImages.length === 0 && (
              <p className="col-span-4 text-center text-muted-foreground py-8">
                No images in library. Upload images via the Image Library page.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialogOpen(false)}>Cancel</Button>
            {imageBlockId && (
              <Button
                variant="destructive"
                onClick={() => associateImageMutation.mutate({ id: imageBlockId, imageUrl: null, imageKey: null })}
              >
                Remove Image
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
