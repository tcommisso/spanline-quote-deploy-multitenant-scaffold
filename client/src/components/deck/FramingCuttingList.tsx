/**
 * FramingCuttingList — NTW-style cutting list table showing all structural members
 * with quantities, sizes, and lengths derived from the subfloor calculation output.
 */
import { useMemo } from "react";
import type { OptionResult, SubfloorInputs, BearerLine } from "../../../../shared/subfloor-calc";

interface CuttingListItem {
  member: string;
  size: string;
  length: number; // mm
  qty: number;
  notes?: string;
}

interface Props {
  option: OptionResult;
  inputs: SubfloorInputs;
}

function formatMM(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)}m` : `${Math.round(mm)}mm`;
}

export default function FramingCuttingList({ option, inputs }: Props) {
  const items = useMemo(() => {
    const list: CuttingListItem[] = [];
    const boardLayout = inputs.boardLayout;
    const boardWidth = boardLayout?.boardWidth || 138;
    const hasPictureFrame = boardLayout?.pictureFrame && boardLayout.pictureFrame !== "none";
    const hasBreaker = boardLayout?.breakerBoard && boardLayout.breakerBoard !== "none";
    const isDouble = boardLayout?.pictureFrame === "double";
    const isDoubleBreaker = boardLayout?.breakerBoard === "double";

    const joistSize = option.profile.label; // e.g. "105 × 50 mm"
    const bearerSize = option.bearerProfile.label;

    // Perimeter frame (outer beams) — always present
    // 2 horizontal beams (length direction) + 2 vertical beams (width direction)
    list.push({
      member: "Perimeter Frame (Top/Bottom)",
      size: bearerSize,
      length: inputs.length,
      qty: 2,
      notes: "Outer frame horizontal",
    });
    list.push({
      member: "Perimeter Frame (Left/Right)",
      size: bearerSize,
      length: inputs.width,
      qty: 2,
      notes: "Outer frame vertical",
    });

    // Edge beams (inner frame) — only when picture frame enabled
    if (hasPictureFrame) {
      const edgeInset = boardWidth; // one board width inset
      const innerLength = inputs.length - 2 * edgeInset;
      const innerWidth = inputs.width - 2 * edgeInset;
      const multiplier = isDouble ? 2 : 1;

      list.push({
        member: "Edge Beam (Top/Bottom)",
        size: joistSize,
        length: Math.round(innerLength),
        qty: 2 * multiplier,
        notes: `Inner frame horizontal${isDouble ? " (double)" : ""}`,
      });
      list.push({
        member: "Edge Beam (Left/Right)",
        size: joistSize,
        length: Math.round(innerWidth),
        qty: 2 * multiplier,
        notes: `Inner frame vertical${isDouble ? " (double)" : ""}`,
      });

      // Noggins between outer and inner frames (all 4 sides)
      const nogginLength = Math.round(edgeInset); // gap between frames
      const topBottomNogginCount = Math.max(2, Math.ceil(inputs.length / option.joistCentres) + 1);
      const leftRightNogginCount = Math.max(2, Math.ceil(inputs.width / option.joistCentres) + 1);

      list.push({
        member: "Noggin (Top/Bottom Edge)",
        size: joistSize,
        length: nogginLength,
        qty: topBottomNogginCount * 2, // top + bottom
        notes: `Between outer & inner frame @ ${option.joistCentres}mm c/c`,
      });
      list.push({
        member: "Noggin (Left/Right Edge)",
        size: joistSize,
        length: nogginLength,
        qty: leftRightNogginCount * 2, // left + right
        notes: `Between outer & inner frame @ ${option.joistCentres}mm c/c`,
      });
    }

    // Breaker beams — when breaker board enabled
    if (hasBreaker) {
      const breakerMultiplier = isDoubleBreaker ? 2 : 1;
      // Breaker direction determines which dimension the beam spans
      const bDir = boardLayout?.breakerDirection || "along-width";
      const breakerBeamLength = bDir === "along-width"
        ? inputs.width - (hasPictureFrame ? 2 * boardWidth : 0)
        : inputs.length - (hasPictureFrame ? 2 * boardWidth : 0);
      list.push({
        member: "Breaker Beam",
        size: joistSize,
        length: breakerBeamLength,
        qty: 2 * breakerMultiplier,
        notes: `Paired beams at breaker position (${bDir === "along-width" ? "along width" : "along length"})${isDoubleBreaker ? " (double)" : ""}`,
      });

      // Noggins between breaker beams
      const breakerNogginSpan = bDir === "along-width" ? inputs.width : inputs.length;
      const breakerNogginCount = Math.max(2, Math.ceil(breakerNogginSpan / option.joistCentres) + 1);
      list.push({
        member: "Noggin (Breaker)",
        size: joistSize,
        length: Math.round(boardWidth * 0.9),
        qty: breakerNogginCount * breakerMultiplier,
        notes: `Between breaker beams @ ${option.joistCentres}mm c/c`,
      });
    }

    // Joists (vertical members)
    list.push({
      member: "Joist",
      size: joistSize,
      length: option.joistLength,
      qty: option.joistCount,
      notes: `@ ${option.joistCentres}mm centres`,
    });

    // Structural bearers (intermediate horizontal members)
    const structuralBearers = option.bearerLines.filter(
      (bl: BearerLine) => bl.type === "structural" && !bl.isWallAttached
    );
    if (structuralBearers.length > 0) {
      list.push({
        member: "Bearer (Structural)",
        size: bearerSize,
        length: option.bearerLength,
        qty: structuralBearers.length,
        notes: "Intermediate support bearers",
      });
    }

    // Waling plate (ledger board) — when wall-mounted
    const isWallMounted = inputs.wall === "wall-mounted";
    if (isWallMounted) {
      list.push({
        member: "Waling Plate (Ledger)",
        size: bearerSize,
        length: inputs.length,
        qty: 1,
        notes: "Fixed to wall with staggered M12 anchors @ 600mm c/c",
      });
    }

    // Posts
    list.push({
      member: "Post",
      size: "90 × 90 mm",
      length: Math.round((inputs.minHeight + inputs.maxHeight) / 2), // average height
      qty: option.postCount,
      notes: `${inputs.minHeight}–${inputs.maxHeight}mm range`,
    });

    return list;
  }, [option, inputs]);

  const totalLinearM = useMemo(() => {
    return items.reduce((sum, item) => sum + item.length * item.qty, 0) / 1000;
  }, [items]);

  return (
    <div className="bg-muted/50 rounded p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold">Framing Cutting List</p>
        <span className="text-[9px] text-muted-foreground font-mono">
          Total: {totalLinearM.toFixed(1)} lin.m
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-0.5 font-semibold">Member</th>
              <th className="text-left py-0.5 font-semibold">Size</th>
              <th className="text-right py-0.5 font-semibold">Length</th>
              <th className="text-right py-0.5 font-semibold">Qty</th>
              <th className="text-left py-0.5 pl-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-border/20">
                <td className="py-0.5 font-medium">{item.member}</td>
                <td className="py-0.5 font-mono text-muted-foreground">{item.size}</td>
                <td className="py-0.5 text-right font-mono">{formatMM(item.length)}</td>
                <td className="py-0.5 text-right font-mono font-semibold">{item.qty}</td>
                <td className="py-0.5 pl-2 text-muted-foreground">{item.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
