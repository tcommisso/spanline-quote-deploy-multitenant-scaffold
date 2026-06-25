import { describe, expect, it } from "vitest";
import { generateItemsFromSpec, type ProductLookup, type SpecMapping, type SpecValues } from "../shared/specEngine";

function product(overrides: Partial<ProductLookup>): ProductLookup {
  return {
    id: 1,
    name: "Slendek .42",
    tabName: "roof",
    uom: "LM",
    baseCost: "0",
    materials: "18",
    installLabour: "0",
    consumables: "0",
    fixedSell: "39.60",
    powderCoatSurcharge: null,
    markupCategory: null,
    coverageWidth: 762,
    ...overrides,
  };
}

function roofMapping(overrides: Partial<SpecMapping> = {}): SpecMapping {
  return {
    id: 100,
    name: "Roof Sheets",
    tabName: "roof",
    specField: "specRoofType",
    condition: "!= ''",
    productId: 1,
    productMatch: "specRoofType",
    qtyFormula: "roofSheetLM",
    description: null,
    colourField: "specRoofTopColour",
    bottomColourField: "specRoofBottomColour",
    uom: "LM",
    sortOrder: 10,
    active: true,
    ...overrides,
  };
}

const roofSpecValues: SpecValues = {
  specRoofType: "Ultra 48",
  specRoofTopColour: "Prospan-Caulfield Green/Smooth Cream",
  specRoofBottomColour: "Smooth Cream",
  specRoofArea: 42.06,
  roofArea: 42.06,
  roofRunWidth: 6,
  roofSheetLength: 7,
};

describe("generateItemsFromSpec roof sheet matching", () => {
  it("prefers the dynamic roof type match over a stale fixed product id", () => {
    const items = generateItemsFromSpec(
      [roofMapping()],
      roofSpecValues,
      [
        product({ id: 1, name: "Slendek .42", coverageWidth: 305 }),
        product({ id: 2, name: "Ultra 48", coverageWidth: 762, fixedSell: "42.00" }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(2);
    expect(items[0].description).toBe("Ultra 48");
  });

  it("prices roof sheet LM from roof area divided by matched product cover", () => {
    const items = generateItemsFromSpec(
      [roofMapping({ qtyFormula: "roofSheetQty" })],
      roofSpecValues,
      [product({ id: 2, name: "Ultra 48", coverageWidth: 762 })],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(55.197);
    expect(items[0].notes).toContain("8 sheets");
    expect(items[0].notes).toContain("42.06m² / 762mm cover = 55.197 LM");
  });
});
