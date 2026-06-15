import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertTriangle, Mail, RefreshCw, Package } from "lucide-react";

export default function LowStockAlerts() {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [alertData, setAlertData] = useState<any>(null);

  const checkMutation = trpc.stocktake.lowStockCheck.useMutation({
    onSuccess: (data) => {
      setAlertData(data);
      if (data.emailSent) {
        toast.success(`Alert email sent to ${recipientEmail} with ${data.totalAlerts} items`);
      } else if (data.totalAlerts === 0) {
        toast.success("All items are above reorder levels");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCheck = (sendEmail: boolean) => {
    checkMutation.mutate({
      sendEmail,
      recipientEmail: sendEmail ? recipientEmail : undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Low Stock Alerts</h1>
          <p className="text-muted-foreground">Monitor items below reorder quantities and send procurement notifications</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Procurement Email</label>
              <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="procurement@company.com" />
            </div>
            <Button variant="outline" onClick={() => handleCheck(false)} disabled={checkMutation.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" /> Check Stock Levels
            </Button>
            <Button onClick={() => handleCheck(true)}
              disabled={checkMutation.isPending || !recipientEmail}>
              <Mail className="w-4 h-4 mr-2" /> Check & Send Alert Email
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {alertData && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className={alertData.totalAlerts > 0 ? "border-red-200" : "border-green-200"}>
              <CardContent className="py-4 text-center">
                <div className={`text-3xl font-bold ${alertData.totalAlerts > 0 ? "text-red-600" : "text-green-600"}`}>
                  {alertData.totalAlerts}
                </div>
                <div className="text-sm text-muted-foreground">Items Below Reorder Level</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-3xl font-bold text-amber-600">
                  {alertData.alerts.filter((a: any) => a.onHand <= 0).length}
                </div>
                <div className="text-sm text-muted-foreground">Out of Stock</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-3xl font-bold">
                  {alertData.emailSent ? "✓" : "—"}
                </div>
                <div className="text-sm text-muted-foreground">Email Sent</div>
              </CardContent>
            </Card>
          </div>

          {/* Alert Items Table */}
          {alertData.alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Items Requiring Replenishment
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Code</th>
                      <th className="px-4 py-3 text-left font-medium">Item</th>
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                      <th className="px-4 py-3 text-right font-medium">On Hand</th>
                      <th className="px-4 py-3 text-right font-medium">Reorder Qty</th>
                      <th className="px-4 py-3 text-right font-medium">Deficit</th>
                      <th className="px-4 py-3 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertData.alerts.map((alert: any) => (
                      <tr key={alert.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs">{alert.code}</td>
                        <td className="px-4 py-2 font-medium">{alert.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{alert.category}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={alert.onHand <= 0 ? "text-red-600 font-bold" : "text-amber-600"}>
                            {alert.onHand}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">{alert.reorderQty}</td>
                        <td className="px-4 py-2 text-right font-bold text-red-600">{alert.deficit}</td>
                        <td className="px-4 py-2 text-center">
                          {alert.onHand <= 0 ? (
                            <Badge variant="destructive">Out of Stock</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Low</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {alertData.alerts.length === 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-8 text-center">
                <Package className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <div className="text-lg font-medium text-green-800">All Stock Levels OK</div>
                <div className="text-sm text-green-700">No items are below their reorder quantities.</div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
