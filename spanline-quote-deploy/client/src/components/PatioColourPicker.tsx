import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { COLORBOND_COLOURS, getColorbondHex, type ColorbondColour } from "@/lib/colorbondColours";

interface PatioColourPickerProps {
  colours: {
    roof: ColorbondColour;
    beam: ColorbondColour;
    post: ColorbondColour;
    gutter: ColorbondColour;
    fascia: ColorbondColour;
  };
  onChange: (colours: PatioColourPickerProps["colours"]) => void;
}

const COMPONENT_LABELS: { key: keyof PatioColourPickerProps["colours"]; label: string }[] = [
  { key: "roof", label: "Roof Sheets" },
  { key: "beam", label: "Beam" },
  { key: "post", label: "Posts" },
  { key: "gutter", label: "Gutter" },
  { key: "fascia", label: "Fascia" },
];

export default function PatioColourPicker({ colours, onChange }: PatioColourPickerProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Colorbond Finishes</h4>
      {COMPONENT_LABELS.map(({ key, label }) => (
        <ColourRow
          key={key}
          label={label}
          value={colours[key]}
          onChange={(colour) => onChange({ ...colours, [key]: colour })}
        />
      ))}
    </div>
  );
}

function ColourRow({ label, value, onChange }: { label: string; value: ColorbondColour; onChange: (c: ColorbondColour) => void }) {
  const [open, setOpen] = useState(false);
  const hex = getColorbondHex(value);

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-2 px-2 min-w-[140px] justify-start">
            <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: hex }} />
            <span className="text-xs truncate">{value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="grid grid-cols-4 gap-1">
            {COLORBOND_COLOURS.map((colour) => {
              const colHex = getColorbondHex(colour);
              const isSelected = colour === value;
              return (
                <button
                  key={colour}
                  className="relative w-full aspect-square rounded-sm border hover:ring-2 ring-primary transition-all"
                  style={{ backgroundColor: colHex }}
                  title={colour}
                  onClick={() => { onChange(colour); setOpen(false); }}
                >
                  {isSelected && (
                    <Check className="absolute inset-0 m-auto h-3 w-3" style={{ color: isLightColour(colHex) ? "#333" : "#fff" }} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">Selected: {value}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function isLightColour(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
