import { ChecklistPricingEditor } from "./AdminSettings";

export default function AdminChecklistPricing() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Additional Costs Pricing</h1>
      <p className="text-sm text-muted-foreground">
        Define priced extra-cost items for the spec sheet's Additional Costs (Priced) section. These are separate from the default work checklist items in each spec section.
      </p>
      <ChecklistPricingEditor />
    </div>
  );
}
