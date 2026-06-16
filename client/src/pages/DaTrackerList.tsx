import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, ChevronLeft, ChevronRight, MapPin, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

const DEFAULT_SUBCLASS = "ADDITIONS/ALTERATION";

export default function DaTrackerList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [subclass, setSubclass] = useState(DEFAULT_SUBCLASS);
  const [applicationType, setApplicationType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: filterOptions } = trpc.daTracker.filterOptions.useQuery();
  const { data, isLoading } = trpc.daTracker.list.useQuery({
    search: search || undefined,
    district: district || undefined,
    subclass: subclass || undefined,
    applicationType: applicationType || undefined,
    limit,
    offset,
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DA Tracker — List View</h1>
          <p className="text-muted-foreground text-sm">
            {total} active development applications
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by division..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
                className="pl-9"
              />
            </div>
            <Select value={district} onValueChange={(v) => { setDistrict(v === "all" ? "" : v); setOffset(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="District" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Districts</SelectItem>
                {filterOptions?.districts.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subclass} onValueChange={(v) => { setSubclass(v === "all" ? "" : v); setOffset(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Subclass" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subclasses</SelectItem>
                {filterOptions?.subclasses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={applicationType} onValueChange={(v) => { setApplicationType(v === "all" ? "" : v); setOffset(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Application Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {filterOptions?.applicationTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No applications found matching your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DA Number</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Block/Section</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subclass</TableHead>
                  <TableHead>Lodgement</TableHead>
                  <TableHead>First Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((da) => (
                  <TableRow key={da.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/da-tracker/${da.id}`)}>
                    <TableCell className="font-medium">{da.daNumber}</TableCell>
                    <TableCell>{da.division || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{da.district || "—"}</Badge>
                    </TableCell>
                    <TableCell>{da.block}/{da.section}</TableCell>
                    <TableCell className="text-xs">{da.applicationType || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={da.subclass === "Residential" ? "default" : "secondary"} className="text-xs">
                        {da.subclass || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {da.lodgementDate ? new Date(da.lodgementDate).toLocaleDateString("en-AU") : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {da.firstSeenAt ? new Date(da.firstSeenAt).toLocaleDateString("en-AU") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
