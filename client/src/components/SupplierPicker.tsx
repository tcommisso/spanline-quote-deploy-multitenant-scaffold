import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Mail, MapPin, Phone, Search, Tag, X } from "lucide-react";

interface SupplierData {
  id: number;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  category?: string | null;
  isActive?: boolean | null;
}

interface SupplierPickerProps {
  selectedSupplierId?: number | null;
  onSupplierSelect: (supplier: SupplierData) => void;
  onSupplierClear?: () => void;
  supplierName?: string;
  supplierScope?: "construction" | "manufacturing";
  placeholder?: string;
}

export default function SupplierPicker({
  selectedSupplierId,
  onSupplierSelect,
  onSupplierClear,
  supplierName,
  supplierScope = "construction",
  placeholder = "Search suppliers by name, contact, email or phone...",
}: SupplierPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: suppliers = [] } = trpc.suppliers.list.useQuery({
    activeOnly: false,
    supplierScope,
  });

  const selectedSupplier = selectedSupplierId
    ? suppliers.find((supplier) => supplier.id === selectedSupplierId)
    : null;

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = q
      ? suppliers.filter((supplier) =>
          [
            supplier.name,
            supplier.contactName,
            supplier.email,
            supplier.phone,
            supplier.category,
          ].some((value) => String(value || "").toLowerCase().includes(q)),
        )
      : suppliers;
    return rows.slice(0, 30);
  }, [searchQuery, suppliers]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selectedSupplierId && selectedSupplier) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <span className="font-semibold">{selectedSupplier.name}</span>
                {selectedSupplier.category && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Tag className="w-3 h-3" /> {selectedSupplier.category}
                  </span>
                )}
                {selectedSupplier.isActive === false && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {selectedSupplier.contactName && <span>{selectedSupplier.contactName}</span>}
                {selectedSupplier.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedSupplier.phone}</span>
                )}
                {selectedSupplier.email && (
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {selectedSupplier.email}</span>
                )}
                {selectedSupplier.address && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedSupplier.address}</span>
                )}
              </div>
            </div>
            {onSupplierClear && (
              <Button type="button" variant="ghost" size="icon" onClick={onSupplierClear} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedSupplierId && !selectedSupplier && supplierName) {
    return (
      <div className="space-y-3">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Saved certifier supplier link could not be resolved</p>
                <p className="font-medium">{supplierName}</p>
              </div>
              {onSupplierClear && (
                <Button type="button" variant="ghost" size="icon" onClick={onSupplierClear} className="h-8 w-8">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <SupplierSearchBox
          searchRef={searchRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showResults={showResults}
          setShowResults={setShowResults}
          suppliers={filteredSuppliers}
          onSupplierSelect={onSupplierSelect}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <SupplierSearchBox
      searchRef={searchRef}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      showResults={showResults}
      setShowResults={setShowResults}
      suppliers={filteredSuppliers}
      onSupplierSelect={onSupplierSelect}
      placeholder={placeholder}
    />
  );
}

function SupplierSearchBox({
  searchRef,
  searchQuery,
  setSearchQuery,
  showResults,
  setShowResults,
  suppliers,
  onSupplierSelect,
  placeholder,
}: {
  searchRef: RefObject<HTMLDivElement | null>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  showResults: boolean;
  setShowResults: (value: boolean) => void;
  suppliers: SupplierData[];
  onSupplierSelect: (supplier: SupplierData) => void;
  placeholder: string;
}) {
  return (
    <div ref={searchRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="pl-9"
        />
      </div>
      {showResults && suppliers.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-auto">
          {suppliers.map((supplier) => (
            <button
              key={supplier.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b last:border-b-0"
              onClick={() => {
                onSupplierSelect(supplier);
                setShowResults(false);
                setSearchQuery("");
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{supplier.name}</span>
                {supplier.isActive === false && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Inactive</span>
                )}
                {supplier.category && (
                  <span className="text-xs text-muted-foreground ml-auto">{supplier.category}</span>
                )}
              </div>
              <div className="text-sm text-muted-foreground flex flex-wrap gap-3">
                {supplier.contactName && <span>{supplier.contactName}</span>}
                {supplier.phone && <span>{supplier.phone}</span>}
                {supplier.email && <span>{supplier.email}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {showResults && searchQuery.trim().length > 0 && suppliers.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground">
          No suppliers found matching your search.
        </div>
      )}
    </div>
  );
}
