import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

export default function ManufacturingQRCodes() {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [qrImages, setQrImages] = useState<Record<number, string>>({});
  const printRef = useRef<HTMLDivElement>(null);

  const { data: orders } = trpc.manufacturing.orders.list.useQuery({});
  const { data: tasks, refetch: refetchTasks } = trpc.manufacturingDispatch.qr.getTaskTokens.useQuery(
    { orderId: Number(selectedOrderId) },
    { enabled: !!selectedOrderId }
  );

  const generateTokens = trpc.manufacturingDispatch.qr.generateTokens.useMutation({
    onSuccess: (result) => {
      refetchTasks();
      toast.success(`Generated ${result.generated} QR codes for ${result.total} tasks`);
    },
  });

  // Generate QR code images when tasks change
  useEffect(() => {
    if (!tasks) return;
    const baseUrl = window.location.origin;
    const generateImages = async () => {
      const images: Record<number, string> = {};
      for (const task of tasks) {
        if (task.qrToken) {
          const url = `${baseUrl}/scan/${task.qrToken}`;
          images[task.id] = await QRCode.toDataURL(url, { width: 150, margin: 1 });
        }
      }
      setQrImages(images);
    };
    generateImages();
  }, [tasks]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>QR Codes - Manufacturing Tasks</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 10px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .card { border: 1px solid #ccc; padding: 8px; text-align: center; page-break-inside: avoid; }
        .card img { width: 120px; height: 120px; }
        .card h4 { margin: 4px 0; font-size: 11px; }
        .card p { margin: 2px 0; font-size: 9px; color: #666; }
        @media print { .grid { grid-template-columns: repeat(3, 1fr); } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="h-6 w-6" /> QR Task Codes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and print QR codes for floor staff to scan and update task status</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select manufacturing order" />
          </SelectTrigger>
          <SelectContent>
            {orders?.map(o => (
              <SelectItem key={o.id} value={String(o.id)}>{o.orderNumber} - {o.clientName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedOrderId && (
          <>
            <Button variant="outline" onClick={() => generateTokens.mutate({ orderId: Number(selectedOrderId) })} disabled={generateTokens.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Generate Codes
            </Button>
            <Button onClick={handlePrint} disabled={!tasks?.some(t => t.qrToken)}>
              <Printer className="h-4 w-4 mr-1" /> Print All
            </Button>
          </>
        )}
      </div>

      {!selectedOrderId ? (
        <div className="text-center py-12 text-muted-foreground">
          <QrCode className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Select an order to view and generate QR codes</p>
        </div>
      ) : !tasks?.length ? (
        <div className="text-center py-8 text-muted-foreground">No tasks found for this order</div>
      ) : (
        <div ref={printRef}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tasks.map(task => (
              <div key={task.id} className="card border rounded-lg p-3 text-center">
                {qrImages[task.id] ? (
                  <img src={qrImages[task.id]} alt={`QR for ${task.productName}`} className="mx-auto w-[120px] h-[120px]" />
                ) : (
                  <div className="w-[120px] h-[120px] mx-auto bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No QR
                  </div>
                )}
                <h4 className="text-xs font-semibold mt-1 truncate">{task.productName}</h4>
                <p className="text-[10px] text-muted-foreground">
                  {task.category} {task.colour ? `| ${task.colour}` : ""} | Qty: {task.quantity} {task.unit}
                </p>
                <Badge variant="outline" className="text-[9px] mt-1">{task.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
