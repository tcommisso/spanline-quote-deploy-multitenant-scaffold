import MasterDataCategory from "./MasterDataCategory";

export default function PricingComplexity() {
  return (
    <MasterDataCategory
      category="complexity"
      title="Complexity"
      description="Configure complexity loading factors for job difficulty adjustments"
      keyLabel="Complexity Level"
      valueLabel="Loading Factor (%)"
      keyPlaceholder="e.g. Standard"
      valuePlaceholder="e.g. 0"
    />
  );
}
