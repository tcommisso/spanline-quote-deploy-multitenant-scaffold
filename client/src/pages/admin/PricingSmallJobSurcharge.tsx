import MasterDataCategory from "./MasterDataCategory";

export default function PricingSmallJobSurcharge() {
  return (
    <MasterDataCategory
      category="small_job_surcharge"
      title="Small Job Surcharge"
      description="Configure default small job surcharge amounts for quotes below a threshold"
      keyLabel="Surcharge Type"
      valueLabel="Amount ($)"
      keyPlaceholder="e.g. Standard Surcharge"
      valuePlaceholder="e.g. 1500"
    />
  );
}
