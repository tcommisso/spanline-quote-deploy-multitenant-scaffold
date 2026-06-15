import MasterDataCategory from "./MasterDataCategory";

export default function PricingDelivery() {
  return (
    <MasterDataCategory
      category="delivery"
      title="Delivery"
      description="Configure default delivery fee amounts for quotes"
      keyLabel="Delivery Type"
      valueLabel="Amount ($)"
      keyPlaceholder="e.g. Standard Delivery"
      valuePlaceholder="e.g. 500"
    />
  );
}
