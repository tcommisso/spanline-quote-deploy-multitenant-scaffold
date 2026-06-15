import type jsPDF from "jspdf";

/**
 * Adds an "INTERNAL USE ONLY" watermark stamp to all pages of a jsPDF document.
 * Call this AFTER all content has been added but BEFORE saving/outputting.
 */
export function applyInternalUseWatermark(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Diagonal watermark text
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
    doc.setFontSize(60);
    doc.setTextColor(220, 38, 38); // Red
    doc.setFont("helvetica", "bold");

    // Center the diagonal text
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    doc.text("INTERNAL USE ONLY", centerX, centerY, {
      align: "center",
      angle: 45,
    });
    doc.restoreGraphicsState();

    // Top banner stamp
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageWidth, 6, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("INTERNAL USE ONLY — CONSTRUCTION CHECK MEASURE DOCUMENT", pageWidth / 2, 4, {
      align: "center",
    });
    doc.restoreGraphicsState();

    // Bottom banner stamp
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
    doc.setFillColor(220, 38, 38);
    doc.rect(0, pageHeight - 6, pageWidth, 6, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.text("This document is for internal construction use only. Not for client distribution.", pageWidth / 2, pageHeight - 2.5, {
      align: "center",
    });
    doc.restoreGraphicsState();
  }
}
