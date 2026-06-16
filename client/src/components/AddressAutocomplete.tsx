/**
 * AddressAutocomplete — address autocomplete input.
 * Uses server-side tRPC procedures backed by the configured geocoder provider.
 */

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export interface AddressResult {
  /** Full formatted address string */
  fullAddress: string;
  /** Unit/suite/apartment number (e.g. "5" from "5/44 Dalman Cres") */
  unitNumber: string;
  /** Street number + street name */
  streetAddress: string;
  /** Suburb / locality */
  suburb: string;
  /** State abbreviation (e.g. ACT, NSW) */
  state: string;
  /** Postcode */
  postcode: string;
  /** Country */
  country: string;
  /** Latitude */
  lat?: number;
  /** Longitude */
  lng?: number;
}

interface AddressAutocompleteProps {
  /** Current value of the address input */
  value: string;
  /** Called when the user types (raw text) */
  onChange: (value: string) => void;
  /** Called when the user selects a suggestion (structured address) */
  onAddressSelect: (address: AddressResult) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class names */
  className?: string;
  /** Restrict to a specific country (ISO 3166-1 alpha-2), defaults to AU */
  country?: string;
  /** Disable the input */
  disabled?: boolean;
}

interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing an address...",
  className,
  country = "au",
  disabled = false,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  // Close dropdown on outside click
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        setShowDropdown(false);
      }
    }, 200);
  }, []);

  // Fetch predictions via tRPC
  const fetchPredictions = useCallback(
    async (input: string) => {
      if (input.length < 3) {
        setPredictions([]);
        setShowDropdown(false);
        return;
      }

      try {
        const results = await utils.client.quotes.placesAutocomplete.query({
          input,
          country,
        });
        setPredictions(results);
        setShowDropdown(results.length > 0);
        setSelectedIndex(-1);
      } catch (err) {
        console.error("Address autocomplete error:", err);
        setPredictions([]);
      }
    },
    [country, utils]
  );

  // Handle input change with debounce
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPredictions(val);
    }, 300);
  }

  // Handle selecting a prediction
  async function handleSelect(prediction: Prediction) {
    setLoading(true);
    setShowDropdown(false);

    try {
      const details = await utils.client.quotes.placeDetails.query({
        placeId: prediction.placeId,
      });

      const result: AddressResult = {
        fullAddress: details.fullAddress,
        unitNumber: details.unitNumber,
        streetAddress: details.streetAddress,
        suburb: details.suburb,
        state: details.state,
        postcode: details.postcode,
        country: details.country,
        lat: details.lat,
        lng: details.lng,
      };

      onChange(details.fullAddress);
      onAddressSelect(result);
    } catch (err) {
      console.error("Place details error:", err);
      // Fallback: use the description as the address
      onChange(prediction.description);
    } finally {
      setLoading(false);
    }
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || predictions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(predictions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn("pl-9", className)}
          disabled={disabled}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {predictions.map((prediction, idx) => (
            <button
              key={prediction.placeId}
              type="button"
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors border-b last:border-b-0",
                idx === selectedIndex && "bg-accent"
              )}
              onClick={() => handleSelect(prediction)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">
                    {prediction.mainText}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {prediction.secondaryText}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
