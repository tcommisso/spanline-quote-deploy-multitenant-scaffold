import { ChecklistPricingEditor } from "./AdminSettings";

export default function AdminChecklistPricing() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Checklist Item Pricing</h1>
      <p className="text-sm text-muted-foreground">
        Define checklist items with pricing. When a design adviser checks an item on the spec sheet, they are automatically added to the quote's Additional Costs.
      </p>
      <ChecklistPricingEditor />
    </div>
  );
}
