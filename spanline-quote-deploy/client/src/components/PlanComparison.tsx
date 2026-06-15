import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Maximize2, Minimize2, ArrowLeftRight } from "lucide-react";

interface PlanVersion {
  id: number;
  title: string;
  version: number;
  fileName: string;
  fileUrl: string;
  description?: string | null;
  createdAt: string | Date;
}

interface PlanComparisonProps {
  open: boolean;
  onClose: () => void;
  plans: PlanVersion[];
  initialLeftId?: number;
  initialRightId?: number;
}

export function PlanComparison({ open, onClose, plans, initialLeftId, initialRightId }: PlanComparisonProps) {
  const sortedPlans = [...plans].sort((a, b) => a.version - b.version);
  const [leftId, setLeftId] = useState<number>(initialLeftId || sortedPlans[0]?.id || 0);
  const [rightId, setRightId] = useState<number>(initialRightId || sortedPlans[sortedPlans.length - 1]?.id || 0);
  const [fullscreen, setFullscreen] = useState(false);

  const leftPlan = sortedPlans.find(p => p.id === leftId);
  const rightPlan = sortedPlans.find(p => p.id === rightId);

  const isImage = (fileName: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);
  const isPdf = (fileName: string) => /\.pdf$/i.test(fileName);

  const renderPreview = (plan: PlanVersion | undefined) => {
    if (!plan) return <div className="flex items-center justify-center h-full text-muted-foreground">Select a version</div>;
    if (isImage(plan.fileName)) {
      return <img src={plan.fileUrl} alt={plan.title} className="max-w-full max-h-full object-contain" />;
    }
    if (isPdf(plan.fileName)) {
      return <iframe src={plan.fileUrl} className="w-full h-full border-0" title={plan.title} />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Preview not available for this file type</p>
        <a href={plan.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm mt-2 underline">
          Open in new tab
        </a>
      </div>
    );
  };

  const swapVersions = () => {
    setLeftId(rightId);
    setRightId(leftId);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={fullscreen ? "max-w-[98vw] h-[95vh]" : "max-w-6xl h-[80vh]"}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Compare Plan Versions</DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => setFullscreen(!fullscreen)}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>

        {/* Version Selectors */}
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="flex-1">
            <Select value={String(leftId)} onValueChange={(v) => setLeftId(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {sortedPlans.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    v{p.version} — {p.title} ({new Date(p.createdAt).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="icon" onClick={swapVersions} title="Swap versions">
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <Select value={String(rightId)} onValueChange={(v) => setRightId(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {sortedPlans.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    v{p.version} — {p.title} ({new Date(p.createdAt).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Side-by-side Preview */}
        <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
          {/* Left Panel */}
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <Badge variant="outline" className="text-xs">v{leftPlan?.version || "?"}</Badge>
              <span className="text-sm font-medium truncate">{leftPlan?.title || "—"}</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 overflow-auto bg-gray-50 dark:bg-gray-900">
              {renderPreview(leftPlan)}
            </div>
            {leftPlan?.description && (
              <div className="px-3 py-1.5 border-t text-xs text-muted-foreground truncate">
                {leftPlan.description}
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
              <Badge variant="outline" className="text-xs">v{rightPlan?.version || "?"}</Badge>
              <span className="text-sm font-medium truncate">{rightPlan?.title || "—"}</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 overflow-auto bg-gray-50 dark:bg-gray-900">
              {renderPreview(rightPlan)}
            </div>
            {rightPlan?.description && (
              <div className="px-3 py-1.5 border-t text-xs text-muted-foreground truncate">
                {rightPlan.description}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
