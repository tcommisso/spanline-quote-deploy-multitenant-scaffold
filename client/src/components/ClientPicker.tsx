import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, X, User, Building2, Phone, Mail, MapPin, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface ClientData {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  designAdvisor?: string | null;
}

interface ClientPickerProps {
  selectedClientId?: number | null;
  onClientSelect: (client: ClientData) => void;
  onClientClear?: () => void;
  // Fallback display when no client is selected
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
}

/**
 * LeadPicker — searches CRM leads (which ARE the clients) regardless of status.
 * Exported as default and also as ClientPicker for backward compatibility.
 */
export default function ClientPicker({
  selectedClientId,
  onClientSelect,
  onClientClear,
  clientName,
  clientEmail,
  clientPhone,
  clientAddress,
}: ClientPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Search all CRM leads regardless of status
  const { data: searchResults } = trpc.crm.leads.searchAll.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  // Get a specific lead by ID (for displaying selected lead)
  const { data: selectedLead } = trpc.crm.leads.get.useQuery(
    { id: selectedClientId! },
    { enabled: !!selectedClientId }
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Map CRM lead to ClientData format
  const displayClient: ClientData | null = selectedLead ? {
    id: selectedLead.id,
    name: [selectedLead.contactFirstName, selectedLead.contactLastName].filter(Boolean).join(" ") || "Unknown",
    email: selectedLead.contactEmail,
    phone: selectedLead.contactPhone,
    company: selectedLead.company,
    address: selectedLead.contactAddress,
    suburb: selectedLead.suburb,
    state: selectedLead.state,
    postcode: selectedLead.postcode,
  } : null;

  const hasClient = !!selectedClientId && !!displayClient;

  if (hasClient) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="font-semibold">{displayClient.name}</span>
                {displayClient.company && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {displayClient.company}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {displayClient.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {displayClient.phone}</span>
                )}
                {displayClient.email && (
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {displayClient.email}</span>
                )}
                {(displayClient.address || displayClient.suburb) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {[displayClient.address, displayClient.suburb, displayClient.state, displayClient.postcode].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/crm/leads/${displayClient.id}/preview`}>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Quotes
                </Button>
              </Link>
              {onClientClear && (
                <Button variant="ghost" size="icon" onClick={onClientClear} className="h-8 w-8">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show fallback info if we have client name but no clientId
  if (!selectedClientId && clientName) {
    return (
      <div className="space-y-3">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Legacy client (not linked to a lead)</p>
                <p className="font-medium">{clientName}</p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {clientPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {clientPhone}</span>}
                  {clientEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {clientEmail}</span>}
                  {clientAddress && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {clientAddress}</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <LeadSearchBox
          searchRef={searchRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showResults={showResults}
          setShowResults={setShowResults}
          searchResults={searchResults}
          onClientSelect={onClientSelect}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LeadSearchBox
        searchRef={searchRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showResults={showResults}
        setShowResults={setShowResults}
        searchResults={searchResults}
        onClientSelect={onClientSelect}
      />
    </div>
  );
}

function LeadSearchBox({
  searchRef,
  searchQuery,
  setSearchQuery,
  showResults,
  setShowResults,
  searchResults,
  onClientSelect,
}: any) {
  return (
    <div ref={searchRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, email, phone..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9"
          />
        </div>
      </div>
      {showResults && searchResults && searchResults.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {searchResults.map((lead: any) => {
            const name = [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unknown";
            return (
              <button
                key={lead.id}
                className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b last:border-b-0"
                onClick={() => {
                  onClientSelect({
                    id: lead.id,
                    name,
                    email: lead.contactEmail,
                    phone: lead.contactPhone,
                    company: lead.company,
                    address: lead.contactAddress,
                    suburb: lead.suburb,
                    state: lead.state,
                    postcode: lead.postcode,
                    designAdvisor: lead.designAdvisor,
                  });
                  setShowResults(false);
                  setSearchQuery("");
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{name}</span>
                  {lead.archived && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Archived</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">{lead.leadNumber}</span>
                </div>
                <div className="text-sm text-muted-foreground flex gap-3">
                  {lead.company && <span>{lead.company}</span>}
                  {lead.contactPhone && <span>{lead.contactPhone}</span>}
                  {lead.contactEmail && <span>{lead.contactEmail}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showResults && searchQuery.length >= 2 && searchResults && searchResults.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground">
          No leads found matching your search.
        </div>
      )}
    </div>
  );
}
