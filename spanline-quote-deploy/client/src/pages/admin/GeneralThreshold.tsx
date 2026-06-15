import MasterDataCategory from "./MasterDataCategory";

export default function GeneralThreshold() {
  return (
    <MasterDataCategory
      category="threshold"
      title="Threshold"
      description="Configure value thresholds for alerts and approval workflows"
      keyLabel="Threshold Name"
      valueLabel="Value ($)"
      keyPlaceholder="e.g. approval_required"
      valuePlaceholder="e.g. 50000"
    />
  );
}
