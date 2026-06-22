import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, FileText, Users, X, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const { data, isLoading } = trpc.globalSearch.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  const navigate = useCallback((path: string) => {
    setOpen(false);
    setQuery("");
    setLocation(path);
  }, [setLocation]);

  const totalResults = data
    ? data.quotes.length + data.deckQuotes.length + data.eclipseQuotes.length + data.leads.length
    : 0;

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors w-full sm:w-64"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search quotes, leads...</span>
        <kbd className="hidden sm:inline-flex ml-auto text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>

      {/* Search dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden [&>button]:hidden">
          <DialogTitle className="sr-only">Search</DialogTitle>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search quotes, leads, clients..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.length < 2 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}

            {query.length >= 2 && !isLoading && totalResults === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results found for "{query}"
              </div>
            )}

            {data && totalResults > 0 && (
              <div className="py-2">
                {/* Structure Quotes */}
                {data.quotes.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Structure Quotes
                    </div>
                    {data.quotes.map((q) => (
                      <button
                        key={`sq-${q.id}`}
                        onClick={() => navigate(`/quotes/${q.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/50 text-left transition-colors"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{q.clientName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {q.quoteNumber} · {q.siteAddress || "No address"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {q.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {/* Deck Quotes */}
                {data.deckQuotes.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Deck Quotes
                    </div>
                    {data.deckQuotes.map((q) => (
                      <button
                        key={`dq-${q.id}`}
                        onClick={() => navigate(`/deck/${q.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/50 text-left transition-colors"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{q.clientName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {q.quoteNumber} · {q.siteAddress || "No address"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {q.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {/* Eclipse Quotes */}
                {data.eclipseQuotes.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Eclipse Quotes
                    </div>
                    {data.eclipseQuotes.map((q) => (
                      <button
                        key={`eq-${q.id}`}
                        onClick={() => navigate(`/eclipse-quotes/${q.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/50 text-left transition-colors"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{q.clientName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {q.quoteNumber} · {q.clientAddress || "No address"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {q.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {/* CRM Leads */}
                {data.leads.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      CRM Leads
                    </div>
                    {data.leads.map((l) => (
                      <button
                        key={`lead-${l.id}`}
                        onClick={() => navigate(`/crm/leads/${l.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/50 text-left transition-colors"
                      >
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {l.contactFirstName} {l.contactLastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {l.leadNumber} · {l.contactEmail || l.contactPhone || ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {l.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Search across all quotes and leads</span>
            <span>ESC to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
