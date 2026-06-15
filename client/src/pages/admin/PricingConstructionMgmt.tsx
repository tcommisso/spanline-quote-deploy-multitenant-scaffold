import MasterDataCategory from "./MasterDataCategory";

export default function PricingConstructionMgmt() {
  return (
    <MasterDataCategory
      category="construction_mgmt"
      title="Construction Management"
      description="Configure default construction management fee amounts for quotes"
      keyLabel="Fee Type"
      valueLabel="Amount ($)"
      keyPlaceholder="e.g. Standard CM Fee"
      valuePlaceholder="e.g. 2000"
    />
  );
}
