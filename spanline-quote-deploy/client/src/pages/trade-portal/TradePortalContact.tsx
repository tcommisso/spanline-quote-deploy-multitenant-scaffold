import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useTradePortal } from "@/contexts/TradePortalContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { User, Save, Loader2, Building, Phone, AlertTriangle } from "lucide-react";

export default function TradePortalContact() {
  const { user } = useTradePortal();
  const { data: details, isLoading, refetch } = trpc.tradePortal.getContactDetails.useQuery();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [abn, setAbn] = useState("");
  const [address, setAddress] = useState("");
  const [bankBsb, setBankBsb] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  useEffect(() => {
    if (details) {
      setName(details.name || "");
      setEmail(details.email || "");
      setPhone(details.phone || "");
      setAbn(details.abn || "");
      setAddress(details.address || "");
      setBankBsb(details.bankBsb || "");
      setBankAccount(details.bankAccount || "");
      setBankName(details.bankName || "");
      setEmergencyContact(details.emergencyContact || "");
      setEmergencyPhone(details.emergencyPhone || "");
    }
  }, [details]);

  const updateContact = trpc.tradePortal.updateContactDetails.useMutation({
    onSuccess: () => {
      toast.success("Contact details updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateContact.mutate({
      name,
      email,
      phone,
      abn,
      address,
      bankBsb,
      bankAccount,
      bankName,
      emergencyContact,
      emergencyPhone,
    });
  }

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48" /><Skeleton className="h-32" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Contact Details</h1>
        <p className="text-sm text-muted-foreground">Keep your details up to date so we can reach you</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
            <div>
              <Label className="text-xs sm:text-sm">Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs sm:text-sm">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs sm:text-sm">Phone</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs sm:text-sm">ABN</Label>
              <Input value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="XX XXX XXX XXX" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs sm:text-sm">Address</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Business or postal address" className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Building className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Bank Details
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">For remittance and payment processing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:space-y-0">
            <div>
              <Label className="text-xs sm:text-sm">Bank Name</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g., Commonwealth Bank" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs sm:text-sm">BSB</Label>
              <Input value={bankBsb} onChange={(e) => setBankBsb(e.target.value)} placeholder="XXX-XXX" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs sm:text-sm">Account Number</Label>
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
            <div>
              <Label className="text-xs sm:text-sm">Contact Name</Label>
              <Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs sm:text-sm">Contact Phone</Label>
              <Input type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Sticky save button on mobile */}
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t shadow-lg sm:static sm:p-0 sm:bg-transparent sm:border-0 sm:shadow-none z-40">
          <Button type="submit" disabled={updateContact.isPending} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
            {updateContact.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save Changes</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
