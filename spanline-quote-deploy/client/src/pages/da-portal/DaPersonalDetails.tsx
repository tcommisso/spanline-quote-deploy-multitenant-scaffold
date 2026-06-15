import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, Calendar, Link2, Unlink } from "lucide-react";

export default function DaPersonalDetails() {
  const utils = trpc.useUtils();
  const { data: details, isLoading } = trpc.daPortal.getPersonalDetails.useQuery();
  const updateMut = trpc.daPortal.updatePersonalDetails.useMutation({
    onSuccess: () => toast.success("Personal details saved"),
    onError: (e) => toast.error(e.message),
  });

  // Nylas calendar connection
  const { data: grant, refetch: refetchGrant } = trpc.nylas.getGrant.useQuery();
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const disconnectMut = trpc.nylas.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Calendar disconnected");
      refetchGrant();
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    abn: "",
    bankBsb: "",
    bankAccount: "",
    bankName: "",
    paymentTerms: "14 days",
  });

  useEffect(() => {
    if (details) {
      setForm({
        fullName: details.fullName || "",
        email: details.email || "",
        phone: details.phone || "",
        address: details.address || "",
        abn: details.abn || "",
        bankBsb: details.bankBsb || "",
        bankAccount: details.bankAccount || "",
        bankName: details.bankName || "",
        paymentTerms: details.paymentTerms || "14 days",
      });
    }
  }, [details]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Personal Details</h1>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
      </div>
    );
  }

  function handleSave() {
    updateMut.mutate(form);
  }

  async function handleConnectCalendar() {
    setConnectingCalendar(true);
    try {
      const redirectUri = `${window.location.origin}/api/nylas/callback`;
      const result = await utils.nylas.getAuthUrl.fetch({ redirectUri });
      if (result?.url) {
        window.open(result.url, "_blank");
        toast.info("Calendar connection opened in a new tab. Complete the sign-in, then return here.");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to get calendar auth URL");
    } finally {
      setConnectingCalendar(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personal Details</h1>
        <Button onClick={handleSave} disabled={updateMut.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateMut.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Your personal and business contact details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
          <CardDescription>ABN and payment information for invoicing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="abn">ABN</Label>
              <Input id="abn" value={form.abn} onChange={e => setForm(f => ({ ...f, abn: e.target.value }))} placeholder="XX XXX XXX XXX" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Input id="paymentTerms" value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="e.g. 14 days" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
          <CardDescription>Used for commission payments via Xero</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name</Label>
              <Input id="bankName" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankBsb">BSB</Label>
              <Input id="bankBsb" value={form.bankBsb} onChange={e => setForm(f => ({ ...f, bankBsb: e.target.value }))} placeholder="XXX-XXX" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccount">Account Number</Label>
              <Input id="bankAccount" value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Connection
          </CardTitle>
          <CardDescription>
            Connect your Outlook or Google calendar to sync appointments from the CRM
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grant?.grantId ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Connected
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {grant.email || "Calendar linked"}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
              >
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                No calendar connected. Link your Outlook or Google account to sync appointments.
              </p>
              <Button
                onClick={handleConnectCalendar}
                disabled={connectingCalendar}
              >
                <Link2 className="h-4 w-4 mr-2" />
                {connectingCalendar ? "Connecting..." : "Connect Calendar"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
