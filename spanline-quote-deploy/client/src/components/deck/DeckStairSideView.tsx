import type { StairGeometry, StairInputs } from "../../../../shared/stairCalc";

interface DeckStairSideViewProps {
  geometry: StairGeometry;
  inputs: StairInputs;
}

/**
 * SVG side-view cross-section of deck stairs showing stringers, treads, risers,
 * handrail, and dimension annotations.
 */
export function DeckStairSideView({ geometry, inputs }: DeckStairSideViewProps) {
  const { numberOfRisers, numberOfGoings, actualRiser, going, stringerLength, stairAngle, totalGoing } = geometry;
  const { totalRise, nosing, riserStyle, handrailStyle, stairWidth } = inputs;

  // SVG coordinate system: origin at bottom-left of stair (ground level)
  // Scale to fit in viewBox
  const padding = 40;
  const dimOffset = 25;
  const handrailH = 900; // handrail height above nosing line

  // Calculate viewBox dimensions
  const drawWidth = totalGoing + nosing + 60; // extra for deck edge
  const drawHeight = totalRise + (handrailStyle !== "none" ? handrailH + 40 : 60);
  const svgW = drawWidth + padding * 2 + dimOffset;
  const svgH = drawHeight + padding * 2 + dimOffset;

  // Transform: flip Y axis (SVG y goes down, we want up)
  const tx = (x: number) => padding + dimOffset + x;
  const ty = (y: number) => svgH - padding - y;

  // Generate stair step points for the stringer outline
  const stepPoints: { x: number; y: number }[] = [];
  // Start at ground level
  stepPoints.push({ x: 0, y: 0 });

  for (let i = 0; i < numberOfGoings; i++) {
    const baseX = i * going;
    const baseY = i * actualRiser;
    // Rise
    stepPoints.push({ x: baseX, y: baseY + actualRiser });
    // Going
    stepPoints.push({ x: baseX + going, y: baseY + actualRiser });
  }
  // Final rise to deck level
  stepPoints.push({ x: numberOfGoings * going, y: totalRise });

  // Stringer thickness (visual only)
  const stringerThick = 50;

  // Colors
  const colors = {
    stringer: "#8B6914",
    tread: "#A0522D",
    riser: "#D2B48C",
    handrail: "#4A4A4A",
    post: "#666666",
    deck: "#6B8E23",
    ground: "#8B8B83",
    dim: "#333333",
    dimLine: "#999999",
  };

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full h-auto"
      style={{ maxHeight: 280 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Ground line */}
      <line
        x1={tx(-20)}
        y1={ty(0)}
        x2={tx(drawWidth)}
        y2={ty(0)}
        stroke={colors.ground}
        strokeWidth={2}
        strokeDasharray="4 2"
      />

      {/* Stringer outline (notched) */}
      <g>
        {/* Draw notched stringer path */}
        {(() => {
          // Outer stringer profile (top edge follows steps)
          let pathD = `M ${tx(0)} ${ty(0)}`;
          for (let i = 0; i < numberOfGoings; i++) {
            const x = i * going;
            const y = (i + 1) * actualRiser;
            // Vertical rise
            pathD += ` L ${tx(x)} ${ty(y)}`;
            // Horizontal going (tread notch)
            pathD += ` L ${tx(x + going)} ${ty(y)}`;
          }
          // Top connection to deck
          pathD += ` L ${tx(numberOfGoings * going)} ${ty(totalRise)}`;

          // Bottom edge of stringer (parallel, offset down by stringerThick)
          // Simplified: straight line from bottom-left to point below top
          const angle = Math.atan(totalRise / totalGoing);
          const offsetX = stringerThick * Math.sin(angle);
          const offsetY = stringerThick * Math.cos(angle);

          return (
            <>
              {/* Stringer body (simplified as angled rectangle) */}
              <polygon
                points={`${tx(-offsetX)},${ty(-offsetY)} ${tx(totalGoing - offsetX)},${ty(totalRise - offsetY)} ${tx(totalGoing + 30)},${ty(totalRise)} ${tx(totalGoing + 30)},${ty(totalRise)} ${tx(0)},${ty(0)}`}
                fill={colors.stringer}
                fillOpacity={0.3}
                stroke={colors.stringer}
                strokeWidth={1.5}
              />
              {/* Step notches */}
              <path
                d={pathD}
                fill="none"
                stroke={colors.stringer}
                strokeWidth={2}
              />
            </>
          );
        })()}
      </g>

      {/* Treads */}
      {Array.from({ length: numberOfGoings }).map((_, i) => {
        const x = i * going;
        const y = (i + 1) * actualRiser;
        const treadW = going + nosing; // tread overhangs by nosing
        const treadH = 22; // board thickness visual
        return (
          <rect
            key={`tread-${i}`}
            x={tx(x - nosing)}
            y={ty(y + treadH)}
            width={treadW * (svgW / (drawWidth + padding * 2 + dimOffset)) * 0.85}
            height={treadH}
            fill={colors.tread}
            stroke={colors.tread}
            strokeWidth={1}
            rx={1}
          />
        );
      })}

      {/* Risers (if closed) */}
      {riserStyle === "closed" && Array.from({ length: numberOfRisers }).map((_, i) => {
        const x = i * going;
        const yBottom = i * actualRiser;
        const yTop = (i + 1) * actualRiser;
        return (
          <rect
            key={`riser-${i}`}
            x={tx(x - 2)}
            y={ty(yTop)}
            width={8}
            height={yTop - yBottom}
            fill={colors.riser}
            stroke={colors.riser}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Deck surface at top */}
      <rect
        x={tx(totalGoing - 10)}
        y={ty(totalRise + 22)}
        width={70}
        height={22}
        fill={colors.deck}
        stroke={colors.deck}
        strokeWidth={1}
        rx={1}
      />

      {/* Handrail */}
      {handrailStyle !== "none" && (
        <g>
          {/* Handrail line (parallel to stringer, offset up by handrailH) */}
          <line
            x1={tx(0)}
            y1={ty(actualRiser + handrailH)}
            x2={tx(totalGoing)}
            y2={ty(totalRise + handrailH)}
            stroke={colors.handrail}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Bottom post */}
          <line
            x1={tx(0)}
            y1={ty(0)}
            x2={tx(0)}
            y2={ty(actualRiser + handrailH)}
            stroke={colors.post}
            strokeWidth={2}
          />
          {/* Top post */}
          <line
            x1={tx(totalGoing)}
            y1={ty(totalRise)}
            x2={tx(totalGoing)}
            y2={ty(totalRise + handrailH)}
            stroke={colors.post}
            strokeWidth={2}
          />
        </g>
      )}

      {/* Dimension: Total Rise (vertical, right side) */}
      <g className="text-[9px]" fill={colors.dim}>
        {/* Vertical dimension line */}
        <line
          x1={tx(totalGoing + 45)}
          y1={ty(0)}
          x2={tx(totalGoing + 45)}
          y2={ty(totalRise)}
          stroke={colors.dimLine}
          strokeWidth={0.5}
        />
        <line x1={tx(totalGoing + 42)} y1={ty(0)} x2={tx(totalGoing + 48)} y2={ty(0)} stroke={colors.dimLine} strokeWidth={0.5} />
        <line x1={tx(totalGoing + 42)} y1={ty(totalRise)} x2={tx(totalGoing + 48)} y2={ty(totalRise)} stroke={colors.dimLine} strokeWidth={0.5} />
        <text
          x={tx(totalGoing + 50)}
          y={ty(totalRise / 2)}
          fontSize={8}
          textAnchor="start"
          dominantBaseline="middle"
          fill={colors.dim}
        >
          {totalRise}mm
        </text>
      </g>

      {/* Dimension: Total Going (horizontal, bottom) */}
      <g fill={colors.dim}>
        <line
          x1={tx(0)}
          y1={ty(-20)}
          x2={tx(totalGoing)}
          y2={ty(-20)}
          stroke={colors.dimLine}
          strokeWidth={0.5}
        />
        <line x1={tx(0)} y1={ty(-17)} x2={tx(0)} y2={ty(-23)} stroke={colors.dimLine} strokeWidth={0.5} />
        <line x1={tx(totalGoing)} y1={ty(-17)} x2={tx(totalGoing)} y2={ty(-23)} stroke={colors.dimLine} strokeWidth={0.5} />
        <text
          x={tx(totalGoing / 2)}
          y={ty(-30)}
          fontSize={8}
          textAnchor="middle"
          fill={colors.dim}
        >
          {totalGoing}mm run
        </text>
      </g>

      {/* Single riser dimension annotation */}
      {numberOfGoings > 0 && (
        <g fill={colors.dim}>
          <text
            x={tx(going / 2)}
            y={ty(actualRiser / 2)}
            fontSize={7}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colors.dim}
          >
            R={Math.round(actualRiser)}
          </text>
          <text
            x={tx(going / 2)}
            y={ty(actualRiser / 2 - 10)}
            fontSize={7}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colors.dim}
          >
            G={going}
          </text>
        </g>
      )}

      {/* Angle annotation */}
      <text
        x={tx(totalGoing / 3)}
        y={ty(totalRise / 3 + 15)}
        fontSize={7}
        fill={colors.dim}
        textAnchor="middle"
      >
        {stairAngle}°
      </text>

      {/* Legend */}
      <text x={tx(0)} y={ty(drawHeight - 5)} fontSize={7} fill={colors.dim}>
        Stair Side View — {numberOfRisers}R × {going}G — 2R+G={geometry.slopeValue}
      </text>
    </svg>
  );
}
