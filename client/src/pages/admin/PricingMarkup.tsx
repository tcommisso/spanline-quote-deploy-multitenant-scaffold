import MasterDataCategory from "./MasterDataCategory";

export default function PricingMarkup() {
  return (
    <MasterDataCategory
      category="markup"
      title="Markup"
      description="Configure markup percentages applied to product cost prices"
      keyLabel="Markup Name"
      valueLabel="Percentage (%)"
      keyPlaceholder="e.g. Standard"
      valuePlaceholder="e.g. 45"
    />
  );
}
