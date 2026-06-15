import MasterDataCategory from "./MasterDataCategory";

export default function PricingRegionRate() {
  return (
    <MasterDataCategory
      category="region_rate"
      title="Region Rate"
      description="Configure region-based rate multipliers for pricing adjustments"
      keyLabel="Region"
      valueLabel="Rate Multiplier"
      keyPlaceholder="e.g. Metro"
      valuePlaceholder="e.g. 1.0"
    />
  );
}
