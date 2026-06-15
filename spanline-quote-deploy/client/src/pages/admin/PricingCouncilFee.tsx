import MasterDataCategory from "./MasterDataCategory";

export default function PricingCouncilFee() {
  return (
    <MasterDataCategory
      category="council_fee"
      title="Council Fee"
      description="Configure council/permit fee schedules by area or type"
      keyLabel="Council / Type"
      valueLabel="Fee Amount ($)"
      keyPlaceholder="e.g. Standard DA"
      valuePlaceholder="e.g. 850"
    />
  );
}
