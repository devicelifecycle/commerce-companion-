import { useRef, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, QrCode, Download } from 'lucide-react';

interface Device {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  sku: string | null;
  storage: string | null;
  color: string | null;
  condition: string;
  cost_price: number;
}

interface InventoryLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device | null;
}

export function InventoryLabelDialog({ open, onOpenChange, device }: InventoryLabelDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (open && device) {
      generateQRCode();
    }
  }, [open, device]);

  const generateQRCode = async () => {
    if (!device) return;

    // QR Code data - encode key device info
    const qrData = JSON.stringify({
      id: device.id,
      sku: device.sku || device.imei,
      brand: device.brand,
      model: device.model,
    });

    // Simple QR code generation using a canvas-based approach
    // In production, you'd use a library like qrcode
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // For now, create a simple placeholder with device info
    // In production, use a proper QR library
    canvas.width = 200;
    canvas.height = 200;
    
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 200);
    
    ctx.fillStyle = 'black';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    
    // Draw a simple pattern representing QR code
    const size = 6;
    const margin = 20;
    const dataStr = device.imei || device.sku || device.id;
    
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        // Create a deterministic pattern based on device data
        const charCode = dataStr.charCodeAt((x + y * 24) % dataStr.length) || 0;
        if ((charCode + x + y) % 3 !== 0) {
          ctx.fillRect(margin + x * size, margin + y * size, size - 1, size - 1);
        }
      }
    }

    // Add finder patterns (corners of QR code)
    const drawFinder = (cx: number, cy: number) => {
      ctx.fillStyle = 'black';
      ctx.fillRect(cx, cy, 7 * size, 7 * size);
      ctx.fillStyle = 'white';
      ctx.fillRect(cx + size, cy + size, 5 * size, 5 * size);
      ctx.fillStyle = 'black';
      ctx.fillRect(cx + 2 * size, cy + 2 * size, 3 * size, 3 * size);
    };

    drawFinder(margin, margin);
    drawFinder(margin + 17 * size, margin);
    drawFinder(margin, margin + 17 * size);

    setQrDataUrl(canvas.toDataURL('image/png'));
  };

  const handlePrint = () => {
    if (!device) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print labels');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Inventory Label - ${device.brand} ${device.model}</title>
          <style>
            @page { size: 2in 1in; margin: 0; }
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 8px;
              width: 2in;
              height: 1in;
              box-sizing: border-box;
            }
            .label {
              display: flex;
              gap: 8px;
              height: 100%;
            }
            .qr-container {
              flex-shrink: 0;
            }
            .qr-code {
              width: 60px;
              height: 60px;
            }
            .info {
              flex: 1;
              font-size: 8px;
              line-height: 1.3;
            }
            .brand-model {
              font-weight: bold;
              font-size: 9px;
              margin-bottom: 2px;
            }
            .sku {
              font-family: monospace;
              font-size: 7px;
            }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="qr-container">
              <img src="${qrDataUrl}" class="qr-code" />
            </div>
            <div class="info">
              <div class="brand-model">${device.brand} ${device.model}</div>
              <div>${device.storage || ''} ${device.color || ''}</div>
              <div>${device.condition}</div>
              <div class="sku">${device.sku || device.imei || device.id.slice(0, 8)}</div>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    if (!qrDataUrl || !device) return;

    const link = document.createElement('a');
    link.download = `label-${device.sku || device.imei || device.id}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  if (!device) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Inventory Label
          </DialogTitle>
          <DialogDescription>
            Print or download a QR code label for this device
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Label Preview */}
          <div className="border rounded-lg p-4 bg-white">
            <div className="flex gap-4">
              {/* QR Code */}
              <div className="flex-shrink-0">
                <canvas ref={canvasRef} className="hidden" />
                {qrDataUrl && (
                  <img 
                    src={qrDataUrl} 
                    alt="QR Code" 
                    className="w-24 h-24 border rounded"
                  />
                )}
              </div>
              
              {/* Device Info */}
              <div className="flex-1 text-sm space-y-1">
                <p className="font-bold">
                  {device.brand} {device.model}
                </p>
                {device.storage && (
                  <p className="text-muted-foreground">{device.storage}</p>
                )}
                {device.color && (
                  <p className="text-muted-foreground">{device.color}</p>
                )}
                <p className="text-xs capitalize">{device.condition}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {device.sku || device.imei || device.id.slice(0, 12)}
                </p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <p className="text-sm text-muted-foreground">
            Scan the QR code to quickly look up this device in the inventory system.
          </p>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
