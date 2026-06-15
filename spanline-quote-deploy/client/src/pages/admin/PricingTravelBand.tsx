import MasterDataCategory from "./MasterDataCategory";

export default function PricingTravelBand() {
  return (
    <MasterDataCategory
      category="travel_band"
      title="Travel Band"
      description="Configure travel distance bands and associated allowances"
      keyLabel="Distance Band"
      valueLabel="Allowance ($)"
      keyPlaceholder="e.g. 0-50km"
      valuePlaceholder="e.g. 150"
    />
  );
}
