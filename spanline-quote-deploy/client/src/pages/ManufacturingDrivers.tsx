import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Pencil, Trash2, Phone, Mail, Car, Shield, Search, User, Truck, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";

export default function ManufacturingDrivers() {
  const { user } = useAuth();
  const isAdmin = user ? isAdminRole(user.role) : false;
  const [showDialog, setShowDialog] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const utils = trpc.useUtils();

  const { data: drivers, isLoading } = trpc.drivers.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
  });
  const { data: availableUsersData } = trpc.drivers.availableUsers.useQuery();
  // Combine system users and driver records for the link dropdown
  const availableUsers = useMemo(() => {
    if (!availableUsersData || Array.isArray(availableUsersData)) return [];
    const sysUsers = (availableUsersData.systemUsers || []).map((u: any) => ({ id: u.id as number, name: u.name as string | null, email: u.email as string | null, source: 'user' as const, role: u.role as string }));
    const drvRecords = (availableUsersData.driverRecords || []).map((d: any) => ({ id: d.id as number, name: d.name as string | null, email: d.email as string | null, source: 'driver' as const, role: 'driver' as string }));
    return [...sysUsers, ...drvRecords];
  }, [availableUsersData]);

  const deleteMutation = trpc.drivers.delete.useMutation({
    onSuccess: () => { utils.drivers.list.invalidate(); toast.success("Driver deactivated"); },
    onError: (e) => toast.error(e.message),
  });

  const [mergeDriver, setMergeDriver] = useState<any>(null);

  function getLicenceStatus(expiry: string | Date | null) {
    if (!expiry) return null;
    const exp = new Date(expiry);
    const now = new Date();
    const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return { label: "Expired", color: "bg-red-100 text-red-700" };
    if (daysUntil < 30) return { label: "Expiring Soon", color: "bg-amber-100 text-amber-700" };
    return { label: "Valid", color: "bg-green-100 text-green-700" };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" /> Drivers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage delivery drivers, licences, and linked user accounts</p>
        </div>
        {isAdmin && (
          <Button variant="brand" onClick={() => { setEditingDriver(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Driver
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers..." className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Hide Inactive" : "Show Inactive"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{drivers?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Drivers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(drivers || []).filter(d => d.licenceExpiry && new Date(d.licenceExpiry) > new Date()).length}
                </p>
                <p className="text-xs text-muted-foreground">Valid Licences</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(drivers || []).filter(d => d.userId).length}
                </p>
                <p className="text-xs text-muted-foreground">Linked Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(drivers || []).filter(d => {
                    if (!d.licenceExpiry) return false;
                    const days = Math.ceil((new Date(d.licenceExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return days >= 0 && days < 30;
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Driver list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !drivers?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No drivers found</p>
          <p className="text-sm">Add drivers to assign them to deliveries</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {drivers.map(driver => {
            const licStatus = getLicenceStatus(driver.licenceExpiry);
            const linkedUser = driver.userId ? (availableUsers || []).find(u => u.id === driver.userId && u.source === 'user') : null;
            return (
              <Card key={driver.id} className={`${!driver.isActive ? "opacity-50" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{driver.name}</CardTitle>
                      {driver.vehicle && <p className="text-sm text-muted-foreground">{driver.vehicle} {driver.licencePlate ? `(${driver.licencePlate})` : ""}</p>}
                    </div>
                    <div className="flex gap-1">
                      {isAdmin && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingDriver(driver); setShowDialog(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {driver.isActive && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                              if (confirm(`Deactivate ${driver.name}?`)) deleteMutation.mutate({ id: driver.id });
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {driver.phone && (
                    <a href={`tel:${driver.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" /> {driver.phone}
                    </a>
                  )}
                  {driver.email && (
                    <a href={`mailto:${driver.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" /> {driver.email}
                    </a>
                  )}
                  {linkedUser && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5" /> Linked: {linkedUser.name || linkedUser.email}
                    </p>
                  )}
                  {!driver.userId && isAdmin && (
                    <Button variant="outline" size="sm" className="mt-1 h-7 text-xs gap-1" onClick={() => setMergeDriver(driver)}>
                      <Link2 className="h-3 w-3" /> Merge with User
                    </Button>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {licStatus && <Badge className={`text-xs ${licStatus.color}`}>{licStatus.label}</Badge>}
                    {driver.licenceNumber && <span className="text-xs text-muted-foreground">Lic: {driver.licenceNumber}</span>}
                  </div>
                  {driver.licenceExpiry && (
                    <p className="text-xs text-muted-foreground">Expires: {new Date(driver.licenceExpiry).toLocaleDateString("en-AU")}</p>
                  )}
                  {driver.notes && <p className="text-xs text-muted-foreground mt-2 italic">{driver.notes}</p>}
                  {!driver.isActive && <Badge variant="outline" className="text-xs text-red-500 border-red-300">Inactive</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DriverDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        driver={editingDriver}
        availableUsers={availableUsers}
      />

      <MergeDialog
        open={!!mergeDriver}
        onOpenChange={(v) => { if (!v) setMergeDriver(null); }}
        driver={mergeDriver}
        systemUsers={availableUsers.filter(u => u.source === 'user')}
      />
    </div>
  );
}

function MergeDialog({ open, onOpenChange, driver, systemUsers }: { open: boolean; onOpenChange: (v: boolean) => void; driver: any; systemUsers: Array<{ id: number; name: string | null; email: string | null; role: string }> }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const utils = trpc.useUtils();

  const mergeMutation = trpc.drivers.mergeWithUser.useMutation({
    onSuccess: () => {
      utils.drivers.list.invalidate();
      utils.drivers.availableUsers.invalidate();
      onOpenChange(false);
      toast.success(`Driver "${driver?.name}" merged with user account. Role set to Driver.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleMerge = () => {
    if (!selectedUserId || !driver) return;
    mergeMutation.mutate({ driverId: driver.id, userId: Number(selectedUserId) });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedUserId(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Driver with User Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Link <strong>{driver?.name}</strong> to a system user account. This will:
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Connect the driver record to the selected user account</li>
            <li>Set the user's role to <strong>Driver</strong> (unless they are an admin)</li>
            <li>Enable portal access and GPS tracking for this driver</li>
          </ul>
          <div>
            <Label>Select User Account</Label>
            <Select value={selectedUserId || "placeholder"} onValueChange={(val) => setSelectedUserId(val === "placeholder" ? "" : val)}>
              <SelectTrigger><SelectValue placeholder="Choose a user account..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder" disabled>Choose a user account...</SelectItem>
                {systemUsers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name || u.email} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleMerge} disabled={!selectedUserId || mergeMutation.isPending}>
            {mergeMutation.isPending ? "Merging..." : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DriverDialog({ open, onOpenChange, driver, availableUsers }: { open: boolean; onOpenChange: (v: boolean) => void; driver: any; availableUsers: Array<{ id: number; name: string | null; email: string | null; source: 'user' | 'driver'; role: string }> }) {
  const [name, setName] = useState(driver?.name || "");
  const [phone, setPhone] = useState(driver?.phone || "");
  const [email, setEmail] = useState(driver?.email || "");
  const [vehicle, setVehicle] = useState(driver?.vehicle || "");
  const [licencePlate, setLicencePlate] = useState(driver?.licencePlate || "");
  const [licenceNumber, setLicenceNumber] = useState(driver?.licenceNumber || "");
  const [licenceExpiry, setLicenceExpiry] = useState(driver?.licenceExpiry ? new Date(driver.licenceExpiry).toISOString().split("T")[0] : "");
  const [userId, setUserId] = useState<string>(driver?.userId ? String(driver.userId) : "");
  const [notes, setNotes] = useState(driver?.notes || "");
  const [isActive, setIsActive] = useState(driver?.isActive ?? true);
  const utils = trpc.useUtils();

  const createDriver = trpc.drivers.create.useMutation({
    onSuccess: () => { utils.drivers.list.invalidate(); onOpenChange(false); toast.success("Driver added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateDriver = trpc.drivers.update.useMutation({
    onSuccess: () => { utils.drivers.list.invalidate(); onOpenChange(false); toast.success("Driver updated"); },
    onError: (e) => toast.error(e.message),
  });

  const handleOpen = (v: boolean) => {
    if (v && driver) {
      setName(driver.name); setPhone(driver.phone || ""); setEmail(driver.email || "");
      setVehicle(driver.vehicle || ""); setLicencePlate(driver.licencePlate || "");
      setLicenceNumber(driver.licenceNumber || "");
      setLicenceExpiry(driver.licenceExpiry ? new Date(driver.licenceExpiry).toISOString().split("T")[0] : "");
      setUserId(driver.userId ? String(driver.userId) : "");
      setNotes(driver.notes || ""); setIsActive(driver.isActive);
    } else if (v && !driver) {
      setName(""); setPhone(""); setEmail(""); setVehicle(""); setLicencePlate("");
      setLicenceNumber(""); setLicenceExpiry(""); setUserId(""); setNotes(""); setIsActive(true);
    }
    onOpenChange(v);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const payload: any = {
      name, phone: phone || undefined, email: email || undefined,
      vehicle: vehicle || undefined, licencePlate: licencePlate || undefined,
      licenceNumber: licenceNumber || undefined,
      licenceExpiry: licenceExpiry || undefined,
      userId: userId ? Number(userId) : undefined,
      notes: notes || undefined,
    };
    if (driver) {
      updateDriver.mutate({ id: driver.id, ...payload, isActive });
    } else {
      createDriver.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{driver ? "Edit Driver" : "Add Driver"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Driver name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0400 000 000" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Vehicle</Label>
              <Input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. Isuzu NPR" />
            </div>
            <div>
              <Label>Licence Plate</Label>
              <Input value={licencePlate} onChange={e => setLicencePlate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Licence Number</Label>
              <Input value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} placeholder="DL12345678" />
            </div>
            <div>
              <Label>Licence Expiry</Label>
              <Input type="date" value={licenceExpiry} onChange={e => setLicenceExpiry(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Link to User Account</Label>
            <Select value={userId || "none"} onValueChange={(val) => setUserId(val === "none" ? "" : val)}>
              <SelectTrigger><SelectValue placeholder="Select user (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked user</SelectItem>
                {availableUsers.filter(u => u.source === 'user').length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">System Users</div>
                    {availableUsers.filter(u => u.source === 'user').map((u) => (
                      <SelectItem key={`user-${u.id}`} value={String(u.id)}>{u.name || u.email} <span className="text-muted-foreground ml-1">({u.role})</span></SelectItem>
                    ))}
                  </>
                )}
                {availableUsers.filter(u => u.source === 'driver').length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">Existing Drivers</div>
                    {availableUsers.filter(u => u.source === 'driver').map((u) => (
                      <SelectItem key={`driver-${u.id}`} value={`driver-${u.id}`}>{u.name} {u.email ? `(${u.email})` : ''}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Link a system user account to this driver for portal access</p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          {driver && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              <Label htmlFor="active">Active</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createDriver.isPending || updateDriver.isPending || !name.trim()}>
            {driver ? "Update" : "Add"} Driver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
