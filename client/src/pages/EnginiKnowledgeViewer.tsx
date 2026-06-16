import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Brain,
  Search,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  BookOpen,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { EnginiAvatar } from "@/components/EnginiAvatar";

export default function EnginiKnowledgeViewer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

  const utils = trpc.useUtils();
  const { data: docs, isLoading } = trpc.techLibrary.listAll.useQuery();

  const updateKnowledgeMutation = trpc.techLibrary.updateKnowledge.useMutation({
    onSuccess: () => {
      utils.techLibrary.listAll.invalidate();
      toast.success("Knowledge updated for this document");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateAllKnowledgeMutation = trpc.techLibrary.updateAllKnowledge.useMutation({
    onSuccess: (data) => {
      utils.techLibrary.listAll.invalidate();
      toast.success(`Knowledge updated: ${data.updated}/${data.total} documents processed`);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      setExpandedIds(new Set());
      setExpandAll(false);
    } else {
      if (docs) {
        setExpandedIds(new Set(docs.map((d) => d.id)));
      }
      setExpandAll(true);
    }
  };

  // Filter docs by search query
  const filteredDocs = docs?.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.code.toLowerCase().includes(q) ||
      (doc.description?.toLowerCase().includes(q)) ||
      (doc.knowledgeSummary?.toLowerCase().includes(q))
    );
  });

  const docsWithKnowledge = docs?.filter((d) => d.knowledgeSummary) || [];
  const docsWithoutKnowledge = docs?.filter((d) => !d.knowledgeSummary && d.active) || [];
  const totalWordCount = docsWithKnowledge.reduce((acc, d) => {
    return acc + (d.knowledgeSummary?.split(/\s+/).length || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <EnginiAvatar size="xl" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Engini's Knowledge Base</h1>
            <p className="text-muted-foreground">
              Review the extracted knowledge summaries that Engini uses to answer questions
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={toggleExpandAll}
          >
            <Eye className="mr-2 h-4 w-4" />
            {expandAll ? "Collapse All" : "Expand All"}
          </Button>
          <Button
            variant="outline"
            onClick={() => updateAllKnowledgeMutation.mutate()}
            disabled={updateAllKnowledgeMutation.isPending}
          >
            {updateAllKnowledgeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-2 h-4 w-4" />
            )}
            Regenerate All Knowledge
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{docsWithKnowledge.length}</p>
                <p className="text-xs text-muted-foreground">Docs with Knowledge</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{docsWithoutKnowledge.length}</p>
                <p className="text-xs text-muted-foreground">Missing Knowledge</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{docs?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <BookOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalWordCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Words in Context</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents, codes, or knowledge content..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Documents with missing knowledge warning */}
      {docsWithoutKnowledge.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                {docsWithoutKnowledge.length} active document{docsWithoutKnowledge.length > 1 ? "s" : ""} without extracted knowledge
              </p>
              <p className="text-amber-700 dark:text-amber-400/80 mt-1">
                These documents are in the library but Engini cannot reference their content:
                {" "}
                {docsWithoutKnowledge.slice(0, 5).map((d) => d.code).join(", ")}
                {docsWithoutKnowledge.length > 5 && ` and ${docsWithoutKnowledge.length - 5} more`}.
                Click "Regenerate All Knowledge" to process them.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Knowledge entries */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !filteredDocs || filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-medium">No matching documents</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery ? "Try a different search term." : "No documents in the library yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => {
            const isExpanded = expandedIds.has(doc.id);
            const wordCount = doc.knowledgeSummary?.split(/\s+/).length || 0;

            return (
              <Card key={doc.id} className={!doc.active ? "opacity-50" : ""}>
                <CardContent className="py-3 px-4">
                  {/* Header row */}
                  <div
                    className="flex items-center gap-3 cursor-pointer select-none"
                    onClick={() => toggleExpand(doc.id)}
                  >
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{doc.title}</span>
                        <Badge variant="outline" className="shrink-0 text-xs">{doc.code}</Badge>
                        {doc.knowledgeSummary ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shrink-0 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {wordCount} words
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            No knowledge
                          </Badge>
                        )}
                        {!doc.active && (
                          <Badge variant="secondary" className="shrink-0 text-xs">Inactive</Badge>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateKnowledgeMutation.mutate({ id: doc.id });
                      }}
                      disabled={updateKnowledgeMutation.isPending}
                      title="Regenerate knowledge for this document"
                    >
                      {updateKnowledgeMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-3 ml-7 border-l-2 border-muted pl-4">
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mb-2 italic">
                          {doc.description}
                        </p>
                      )}
                      {doc.knowledgeSummary ? (
                        <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed font-mono text-xs">
                          {doc.knowledgeSummary}
                        </div>
                      ) : (
                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-400">
                          <p className="font-medium">No knowledge extracted yet</p>
                          <p className="text-xs mt-1">
                            Click the refresh icon to extract knowledge from this document's PDF.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
