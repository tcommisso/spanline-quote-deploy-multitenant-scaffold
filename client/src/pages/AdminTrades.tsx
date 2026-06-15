import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, MessageSquare, Bell, Loader2 } from "lucide-react";

const TRADE_TYPE_OPTIONS = [
  { value: "installer", label: "Installer" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "roofer", label: "Roofer" },
  { value: "carpenter", label: "Carpenter" },
  { value: "concreter", label: "Concreter" },
  { value: "painter", label: "Painter" },
  { value: "tiler", label: "Tiler" },
  { value: "fencer", label: "Fencer" },
  { value: "labourer", label: "Labourer" },
  { value: "other", label: "Other" },
] as const;

function getTradeTypeLabel(value: string) {
  return TRADE_TYPE_OPTIONS.find(o => o.value === value)?.label || value;
}

export default function AdminTrades() {

  const [selectedTrades, setSelectedTrades] = useState<number[]>([]);
  const [showCreateInstaller, setShowCreateInstaller] = useState(false);
  const [editingInstaller, setEditingInstaller] = useState<any>(null);
  const [showBulkSms, setShowBulkSms] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);

  const installersQuery = trpc.construction.installers.list.useQuery();

  const createInstaller = trpc.construction.installers.create.useMutation({
    onSuccess: () => {
      installersQuery.refetch();
      setShowCreateInstaller(false);
      toast.success("Trade added successfully");
    },
  });
  const updateInstaller = trpc.construction.installers.update.useMutation({
    onSuccess: () => {
      installersQuery.refetch();
      setEditingInstaller(null);
      toast.success("Trade updated successfully");
    },
  });
  const deleteInstaller = trpc.construction.installers.delete.useMutation({
    onSuccess: () => {
      installersQuery.refetch();
      toast.success("Trade removed");
    },
  });
  const bulkSms = trpc.construction.bulkNotify.sendSms.useMutation({
    onSuccess: (data: any) => {
      toast.success(`SMS sent to ${data.sent} trade(s)`);
      setSelectedTrades([]);
      setShowBulkSms(false);
    },
  });
  const bulkEmail = trpc.construction.bulkNotify.sendEmail.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Email sent to ${data.sent} trade(s)`);
      setSelectedTrades([]);
      setShowBulkEmail(false);
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Trades</h1>
          {selectedTrades.length > 0 && (
            <Badge variant="secondary" className="text-xs">{selectedTrades.length} selected</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedTrades.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowBulkSms(true)}>
                <MessageSquare className="h-4 w-4 mr-1" /> Send SMS
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBulkEmail(true)}>
                <Bell className="h-4 w-4 mr-1" /> Send Email
              </Button>
            </>
          )}
          {installersQuery.data && installersQuery.data.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedTrades.length === installersQuery.data!.length) {
                  setSelectedTrades([]);
                } else {
                  setSelectedTrades(installersQuery.data!.map(i => i.id));
                }
              }}
            >
              {selectedTrades.length === (installersQuery.data?.length || 0) ? "Deselect All" : "Select All"}
            </Button>
          )}
          <Dialog open={showCreateInstaller} onOpenChange={setShowCreateInstaller}>
            <DialogTrigger asChild>
              <Button size="sm" variant="brand"><Plus className="h-4 w-4 mr-1" /> Add Trade</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Trade</DialogTitle>
              </DialogHeader>
              <CreateInstallerForm
                onSubmit={(data) => createInstaller.mutate(data)}
                loading={createInstaller.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingInstaller} onOpenChange={(open) => { if (!open) setEditingInstaller(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Trade</DialogTitle>
          </DialogHeader>
          {editingInstaller && (
            <CreateInstallerForm
              initialData={editingInstaller}
              onSubmit={(data) => updateInstaller.mutate({ id: editingInstaller.id, ...data })}
              loading={updateInstaller.isPending}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Trades Grid */}
      {installersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-3"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : !installersQuery.data?.length ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No trades added yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {installersQuery.data.map((installer) => (
            <Card key={installer.id} className={selectedTrades.includes(installer.id) ? "ring-2 ring-primary" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedTrades.includes(installer.id)}
                      onCheckedChange={(checked) => {
                        setSelectedTrades(prev =>
                          checked
                            ? [...prev, installer.id]
                            : prev.filter(id => id !== installer.id)
                        );
                      }}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium">{installer.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">{getTradeTypeLabel(installer.tradeType || "installer")}</Badge>
                      {installer.phone && <p className="text-xs text-muted-foreground mt-1">{installer.phone}</p>}
                      {installer.email && <p className="text-xs text-muted-foreground">{installer.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={installer.active ? "default" : "secondary"} className="text-[10px]">
                      {installer.active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingInstaller(installer)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (confirm("Remove this trade?")) {
                          deleteInstaller.mutate({ id: installer.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk SMS Dialog */}
      <BulkSmsDialog
        open={showBulkSms}
        onOpenChange={setShowBulkSms}
        selectedCount={selectedTrades.length}
        onSend={(message) => bulkSms.mutate({ installerIds: selectedTrades, message })}
        loading={bulkSms.isPending}
      />
      {/* Bulk Email Dialog */}
      <BulkEmailDialog
        open={showBulkEmail}
        onOpenChange={setShowBulkEmail}
        selectedCount={selectedTrades.length}
        onSend={(subject, message) => bulkEmail.mutate({ installerIds: selectedTrades, subject, message })}
        loading={bulkEmail.isPending}
      />
    </div>
  );
}

function CreateInstallerForm({ onSubmit, loading, initialData, submitLabel }: {
  onSubmit: (data: any) => void;
  loading: boolean;
  initialData?: any;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialData?.name || "");
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [tradeType, setTradeType] = useState(initialData?.tradeType || "installer");
  return (
    <div className="space-y-4">
      <div>
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mike Johnson" />
      </div>
      <div>
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0412 345 678" />
      </div>
      <div>
        <Label>Email</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. mike@example.com" />
      </div>
      <div>
        <Label>Trade Type *</Label>
        <Select value={tradeType} onValueChange={setTradeType}>
          <SelectTrigger>
            <SelectValue placeholder="Select trade type" />
          </SelectTrigger>
          <SelectContent>
            {TRADE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        className="w-full"
        disabled={!name || loading}
        onClick={() => onSubmit({
          name,
          phone: phone || undefined,
          email: email || undefined,
          tradeType,
        })}
      >
        {loading ? "Saving..." : (submitLabel || "Add Trade")}
      </Button>
    </div>
  );
}

function BulkSmsDialog({ open, onOpenChange, selectedCount, onSend, loading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onSend: (message: string) => void;
  loading: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Bulk SMS</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sending SMS to <strong>{selectedCount}</strong> selected trade(s). Trades without a phone number will be skipped.
          </p>
          <div>
            <Label>Message *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Reminder: you are scheduled for a job this week. Please confirm availability."
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">{message.length} characters</p>
          </div>
          <Button
            className="w-full"
            disabled={!message.trim() || loading}
            onClick={() => onSend(message)}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><MessageSquare className="h-4 w-4 mr-2" /> Send SMS to {selectedCount} Trade(s)</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkEmailDialog({ open, onOpenChange, selectedCount, onSend, loading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onSend: (subject: string, message: string) => void;
  loading: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Bulk Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sending email to <strong>{selectedCount}</strong> selected trade(s). Trades without an email address will be skipped.
          </p>
          <div>
            <Label>Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Upcoming Job Schedule"
            />
          </div>
          <div>
            <Label>Message *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Please find below the details for your upcoming job assignment..."
              rows={5}
            />
          </div>
          <Button
            className="w-full"
            disabled={!subject.trim() || !message.trim() || loading}
            onClick={() => onSend(subject, message)}
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><Bell className="h-4 w-4 mr-2" /> Send Email to {selectedCount} Trade(s)</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
