import MasterDataCategory from "./MasterDataCategory";

export default function GeneralColour() {
  return (
    <MasterDataCategory
      category="colour"
      title="Colour"
      description="Manage available Colorbond and material colour options for quotes"
      keyLabel="Colour Name"
      valueLabel="Colour Code / Group"
      keyPlaceholder="e.g. Monument"
      valuePlaceholder="e.g. Standard"
    />
  );
}
