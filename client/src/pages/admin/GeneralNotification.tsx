import MasterDataCategory from "./MasterDataCategory";

export default function GeneralNotification() {
  return (
    <MasterDataCategory
      category="notification"
      title="Notification"
      description="Configure notification preferences and triggers"
      keyLabel="Setting"
      valueLabel="Value"
      keyPlaceholder="e.g. notify_new_quote"
      valuePlaceholder="e.g. true"
    />
  );
}
