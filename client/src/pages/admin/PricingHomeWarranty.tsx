import MasterDataCategory from "./MasterDataCategory";

export default function PricingHomeWarranty() {
  return (
    <MasterDataCategory
      category="home_warranty"
      title="Home Warranty (HOW) Tiers"
      description="Configure tiered home warranty amounts based on quote total thresholds (ex GST). Key = threshold amount, Value = warranty fee."
      keyLabel="Threshold ($)"
      valueLabel="Warranty Fee ($)"
      keyPlaceholder="e.g. 20000"
      valuePlaceholder="e.g. 600"
    />
  );
}
