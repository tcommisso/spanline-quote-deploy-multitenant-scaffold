import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import type { ColorbondColour } from "@/lib/colorbondColours";
import { getColorbondHex } from "@/lib/colorbondColours";
import type { PatioElement } from "@/components/PatioElementLibrary";
import type { RoofStyle, GutterStyle, DownpipeStyle } from "@/components/PatioStructureOverlay";

interface RenderHistoryEntry {
  id: string;
  imageUrl: string;
  promptMode: "full" | "quick";
  createdAt: number;
}

interface PatioPresentationExportProps {
  projectName: string;
  clientName?: string;
  siteAddress?: string;
  photoUrl: string | null;
  structureState: {
    roofStyle: RoofStyle;
    width: number;
    projection: number;
    roofPitch: number;
    beamHeight: number;
    postHeight: number;
    floorToGround: number;
    postCount: number;
  };
  colours: {
    roof: ColorbondColour;
    beam: ColorbondColour;
    post: ColorbondColour;
    gutter: ColorbondColour;
    fascia: ColorbondColour;
  };
  placedElements: PatioElement[];
  gutterStyle?: GutterStyle;
  downpipeStyle?: DownpipeStyle;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  renderHistory?: RenderHistoryEntry[];
}

export function PatioPresentationExport({
  projectName,
  clientName,
  siteAddress,
  photoUrl,
  structureState,
  colours,
  placedElements,
  gutterStyle,
  downpipeStyle,
  canvasRef,
  renderHistory,
}: PatioPresentationExportProps) {
  const [generating, setGenerating] = useState(false);

  const roofStyleLabels: Record<RoofStyle, string> = {
    flyover: "Flyover",
    "popup-skillion": "Pop-up Skillion",
    gable: "Gable",
    hip: "Hip",
    "flat-eave": "Flat (3\u00b0) Attached to Eave",
  };

  const generatePDF = useCallback(async () => {
    setGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // ===== PAGE 1: Cover with composite image =====
      // Title
      pdf.setFontSize(24);
      pdf.setFont("helvetica", "bold");
      pdf.text("Patio Design Presentation", margin, y + 8);
      y += 16;

      // Project info
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      if (clientName) {
        pdf.text(`Client: ${clientName}`, margin, y);
        y += 6;
      }
      if (siteAddress) {
        pdf.text(`Site: ${siteAddress}`, margin, y);
        y += 6;
      }
      pdf.text(`Project: ${projectName}`, margin, y);
      y += 6;
      pdf.text(`Date: ${new Date().toLocaleDateString("en-AU")}`, margin, y);
      y += 12;

      // Composite image (capture from canvas if available)
      if (canvasRef?.current) {
        try {
          const html2canvas = (await import("html2canvas")).default;
          const canvas = await html2canvas(canvasRef.current, {
            scale: 3, // Higher scale for sharper PDF output
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
            imageTimeout: 15000, // Allow more time for cross-origin images
            removeContainer: true,
            windowWidth: canvasRef.current.scrollWidth,
            windowHeight: canvasRef.current.scrollHeight,
          });
          const imgData = canvas.toDataURL("image/png"); // PNG for lossless quality
          const imgWidth = contentWidth;
          const imgHeight = (canvas.height / canvas.width) * imgWidth;
          const maxImgHeight = pageHeight - y - margin - 20;
          const finalHeight = Math.min(imgHeight, maxImgHeight);
          const finalWidth = (finalHeight / imgHeight) * imgWidth;
          pdf.addImage(imgData, "PNG", margin, y, finalWidth, finalHeight);
          y += finalHeight + 5;
        } catch (err) {
          console.warn("Could not capture canvas:", err);
          pdf.setFontSize(9);
          pdf.setTextColor(128);
          pdf.text("[Composite image not available — upload a site photo to include it]", margin, y);
          pdf.setTextColor(0);
          y += 8;
        }
      } else if (photoUrl) {
        pdf.setFontSize(9);
        pdf.setTextColor(128);
        pdf.text("[Site photo available — open editor to generate composite]", margin, y);
        pdf.setTextColor(0);
        y += 8;
      }

      // Disclaimer
      pdf.setFontSize(7);
      pdf.setTextColor(100);
      pdf.text(
        "For illustrative purposes only. Not a render of the finished structure. Final appearance may vary.",
        margin,
        pageHeight - margin
      );
      pdf.setTextColor(0);

      // ===== PAGE 2: Structure Specifications =====
      pdf.addPage();
      y = margin;

      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text("Structure Specifications", margin, y + 6);
      y += 14;

      // Specs table
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const specs = [
        ["Roof Style", roofStyleLabels[structureState.roofStyle]],
        ["Structure Width", `${structureState.width} mm`],
        ["Roof Projection", `${structureState.projection} mm`],
        ["Roof Pitch", `${structureState.roofPitch}°`],
        ["Beam Height", `${structureState.beamHeight} mm`],
        ["Post Height", `${structureState.postHeight} mm`],
        ["Floor to Ground", `${structureState.floorToGround} mm`],
        ["Number of Posts", `${structureState.postCount}`],
      ];

      // Add gutter/downpipe rows if specified
      const gutterLabels: Record<string, string> = {
        quad: "Quad Gutter",
        "half-round": "Half Round Gutter",
        fascia: "Fascia Gutter",
        none: "None",
      };
      const downpipeLabels: Record<string, string> = {
        round: "90mm Round Downpipe",
        square: "100mm Square Downpipe",
        none: "None",
      };
      if (gutterStyle && gutterStyle !== "none") {
        specs.push(["Gutter Style", gutterLabels[gutterStyle] || gutterStyle]);
      }
      if (downpipeStyle && downpipeStyle !== "none") {
        specs.push(["Downpipe Style", downpipeLabels[downpipeStyle] || downpipeStyle]);
      }

      // Draw table
      const colWidth1 = 55;
      const colWidth2 = contentWidth - colWidth1;
      const rowHeight = 8;

      // Header
      pdf.setFillColor(40, 40, 40);
      pdf.rect(margin, y, contentWidth, rowHeight, "F");
      pdf.setTextColor(255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Parameter", margin + 3, y + 5.5);
      pdf.text("Value", margin + colWidth1 + 3, y + 5.5);
      pdf.setTextColor(0);
      y += rowHeight;

      pdf.setFont("helvetica", "normal");
      specs.forEach(([label, value], i) => {
        if (i % 2 === 0) {
          pdf.setFillColor(245, 245, 245);
          pdf.rect(margin, y, contentWidth, rowHeight, "F");
        }
        pdf.text(label, margin + 3, y + 5.5);
        pdf.text(value, margin + colWidth1 + 3, y + 5.5);
        y += rowHeight;
      });

      y += 12;

      // ===== Colour Selections =====
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Colour Selections", margin, y + 5);
      y += 12;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const colourEntries: [string, ColorbondColour][] = [
        ["Roof Sheets", colours.roof],
        ["Beams", colours.beam],
        ["Posts", colours.post],
        ["Gutters", colours.gutter],
        ["Fascia", colours.fascia],
      ];

      // Colour table header
      pdf.setFillColor(40, 40, 40);
      pdf.rect(margin, y, contentWidth, rowHeight, "F");
      pdf.setTextColor(255);
      pdf.setFont("helvetica", "bold");
      pdf.text("Component", margin + 3, y + 5.5);
      pdf.text("Colorbond Colour", margin + 55 + 3, y + 5.5);
      pdf.text("Swatch", margin + 130, y + 5.5);
      pdf.setTextColor(0);
      y += rowHeight;

      pdf.setFont("helvetica", "normal");
      colourEntries.forEach(([component, colour], i) => {
        if (i % 2 === 0) {
          pdf.setFillColor(245, 245, 245);
          pdf.rect(margin, y, contentWidth, rowHeight, "F");
        }
        pdf.text(component, margin + 3, y + 5.5);
        pdf.text(colour, margin + 55 + 3, y + 5.5);
        // Draw colour swatch
        const hex = getColorbondHex(colour);
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        pdf.setFillColor(r, g, b);
        pdf.rect(margin + 130, y + 1.5, 12, 5, "F");
        pdf.setDrawColor(180);
        pdf.rect(margin + 130, y + 1.5, 12, 5, "S");
        pdf.setDrawColor(0);
        y += rowHeight;
      });

      // ===== PAGE 3: Windows, Doors & Materials =====
      if (placedElements.length > 0) {
        pdf.addPage();
        y = margin;

        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text("Windows & Doors", margin, y + 6);
        y += 14;

        // Elements table
        pdf.setFontSize(9);
        const elColWidths = [55, 35, 35, 35, 20];
        const elHeaders = ["Type", "Width (mm)", "Height (mm)", "Screen", "Qty"];

        pdf.setFillColor(40, 40, 40);
        pdf.rect(margin, y, contentWidth, rowHeight, "F");
        pdf.setTextColor(255);
        pdf.setFont("helvetica", "bold");
        let xPos = margin + 3;
        elHeaders.forEach((h, i) => {
          pdf.text(h, xPos, y + 5.5);
          xPos += elColWidths[i];
        });
        pdf.setTextColor(0);
        y += rowHeight;

        pdf.setFont("helvetica", "normal");
        placedElements.forEach((el, i) => {
          if (i % 2 === 0) {
            pdf.setFillColor(245, 245, 245);
            pdf.rect(margin, y, contentWidth, rowHeight, "F");
          }
          xPos = margin + 3;
          pdf.text(el.label || el.type, xPos, y + 5.5);
          xPos += elColWidths[0];
          pdf.text(`${el.width}`, xPos, y + 5.5);
          xPos += elColWidths[1];
          pdf.text(`${el.height}`, xPos, y + 5.5);
          xPos += elColWidths[2];
          pdf.text(el.screen || "N/A", xPos, y + 5.5);
          xPos += elColWidths[3];
          pdf.text("1", xPos, y + 5.5);
          y += rowHeight;
        });
      }

      // ===== AI Render Page (if renders exist) =====
      if (renderHistory && renderHistory.length > 0) {
        // Use the most recent render
        const latestRender = [...renderHistory].sort((a, b) => b.createdAt - a.createdAt)[0];
        pdf.addPage();
        y = margin;

        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text("AI Visualisation", margin, y + 6);
        y += 14;

        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(80);
        pdf.text(
          `Generated: ${new Date(latestRender.createdAt).toLocaleDateString("en-AU")} | Mode: ${latestRender.promptMode === "full" ? "Full Detail" : "Quick Preview"}`,
          margin,
          y
        );
        pdf.setTextColor(0);
        y += 8;

        try {
          const renderImg = new Image();
          renderImg.crossOrigin = "anonymous";
          await new Promise<void>((resolve) => {
            renderImg.onload = () => resolve();
            renderImg.onerror = () => resolve();
            renderImg.src = latestRender.imageUrl;
          });

          if (renderImg.complete && renderImg.naturalWidth > 0) {
            const renderCanvas = document.createElement("canvas");
            renderCanvas.width = renderImg.naturalWidth;
            renderCanvas.height = renderImg.naturalHeight;
            const rCtx = renderCanvas.getContext("2d");
            if (rCtx) {
              rCtx.drawImage(renderImg, 0, 0);
              const renderData = renderCanvas.toDataURL("image/jpeg", 0.85);
              const imgWidth = contentWidth;
              const imgHeight = (renderImg.naturalHeight / renderImg.naturalWidth) * imgWidth;
              const maxH = pageHeight - y - margin - 20;
              const finalH = Math.min(imgHeight, maxH);
              const finalW = (finalH / imgHeight) * imgWidth;
              pdf.addImage(renderData, "JPEG", margin, y, finalW, finalH);
              y += finalH + 5;
            }
          }
        } catch (err) {
          console.warn("Could not load AI render for PDF:", err);
          pdf.text("[AI render image could not be loaded]", margin, y);
          y += 8;
        }

        // Disclaimer for AI render
        pdf.setFontSize(7);
        pdf.setTextColor(100);
        pdf.text(
          "AI-generated visualisation for illustrative purposes only. Final appearance may vary from render.",
          margin,
          y + 3
        );
        pdf.setTextColor(0);
      }

      // ===== Final page: Disclaimer =====
      const lastPage = pdf.getNumberOfPages();
      pdf.setPage(lastPage);
      pdf.setFontSize(7);
      pdf.setTextColor(100);
      pdf.text(
        "For illustrative purposes only. Not a render of the finished structure. Colours shown are indicative — refer to Colorbond colour samples for accurate representation.",
        margin,
        pageHeight - margin,
        { maxWidth: contentWidth }
      );

      // Save
      const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, "_")}_Presentation.pdf`;
      pdf.save(filename);
      toast.success("Presentation PDF downloaded");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }, [projectName, clientName, siteAddress, photoUrl, structureState, colours, placedElements, gutterStyle, downpipeStyle, canvasRef, renderHistory]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generatePDF}
      disabled={generating}
      className="gap-1.5"
    >
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      Export Presentation
    </Button>
  );
}
