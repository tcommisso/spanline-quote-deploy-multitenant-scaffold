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

function beamMapping(overrides: Partial<SpecMapping> = {}): SpecMapping {
  return {
    id: 200,
    name: "Beams from spec entries",
    tabName: "beams",
    specField: "specBeamEntries",
    condition: "!= ''",
    productId: null,
    productMatch: "specBeamSize",
    qtyFormula: "specWidth",
    description: null,
    colourField: "specBeamColour",
    bottomColourField: null,
    uom: "LM",
    sortOrder: 40,
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

describe("generateItemsFromSpec beam entry matching", () => {
  it("rolls up beam entry LM by material and size", () => {
    const items = generateItemsFromSpec(
      [beamMapping()],
      {
        specBeamSize: "stale fallback size",
        specBeamColour: "Monument",
        specWidth: 99,
        specBeamEntries: [
          { type: "Steel", size: "150x60", lm: 6.5 },
          { type: "Steel", size: "150 x 60", lm: "3.2" },
          { type: "Aluminium", size: "150 x 60", lm: 2.1 },
          { type: "Steel", size: "200x60", lm: 0 },
        ],
      },
      [
        product({ id: 10, name: "Steel Beam 150 x 60", tabName: "beams", coverageWidth: null, fixedSell: "50.00" }),
        product({ id: 11, name: "Aluminium Beam 150 x 60", tabName: "beams", coverageWidth: null, fixedSell: "42.00" }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(2);
    expect(items.map(item => item.productId)).toEqual([10, 11]);
    expect(items.map(item => item.qty)).toEqual([9.7, 2.1]);
    expect(items.map(item => item.description)).toEqual([
      "Steel Beam 150 x 60",
      "Aluminium Beam 150 x 60",
    ]);
    expect(items.every(item => item.colour === "Monument")).toBe(true);
    expect(items[0].notes).toContain("Steel 150 x 60 = 9.7 LM");
    expect(items[1].notes).toContain("Aluminium 150 x 60 = 2.1 LM");
  });
});

describe("generateItemsFromSpec attachment descriptions", () => {
  it("falls back to the selected product match value for dynamic bracket mappings", () => {
    const items = generateItemsFromSpec(
      [{
        id: 300,
        name: "Number of Brackets",
        tabName: "attachment",
        specField: "specBracketAttachmentMethod",
        condition: "!= ''",
        productId: null,
        productMatch: "specBracketAttachmentMethod",
        qtyFormula: "specNumberOfBrackets",
        description: null,
        colourField: "specBracketColour",
        bottomColourField: null,
        uom: "ea",
        sortOrder: 30,
        active: true,
      }],
      {
        specBracketAttachmentMethod: "Gable brackets",
        specNumberOfBrackets: 6,
        specBracketColour: "Basal",
      },
      [],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Gable brackets");
    expect(items[0].qty).toBe(6);
  });
});

describe("generateItemsFromSpec wall entry matching", () => {
  it("calculates IWP wall LM from each wall width and product-specific cover width", () => {
    const items = generateItemsFromSpec(
      [{
        id: 400,
        name: "IWP / Ceiling Panels",
        tabName: "walls",
        specField: "specIwpEntries",
        condition: "!= ''",
        productId: null,
        productMatch: "specIwpEntries",
        qtyFormula: "wallSheetLM",
        description: null,
        colourField: "specIwpColour",
        bottomColourField: null,
        uom: "LM",
        sortOrder: 72,
        active: true,
      }],
      {
        specIwpEntries: [
          {
            type: "Panelux Steel/Steel 1140mm",
            width: 6000,
            height: 2400,
            outsideColour: "Gull Grey",
            insideColour: "Pearl White",
          },
          {
            type: "Panelux Narrow 900mm",
            width: 3000,
            height: 2100,
            outsideColour: "Gull Grey",
            insideColour: "Pearl White",
          },
        ],
      },
      [
        product({ id: 20, name: "Panelux Steel/Steel 1140mm", tabName: "walls", coverageWidth: 1140, fixedSell: "50.00" }),
        product({ id: 21, name: "Panelux Narrow 900mm", tabName: "walls", coverageWidth: 900, fixedSell: "60.00" }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(2);
    expect(items.map(item => item.description)).toEqual([
      "Panelux Steel/Steel 1140mm",
      "Panelux Narrow 900mm",
    ]);
    expect(items.map(item => item.qty)).toEqual([14.4, 8.4]);
    expect(items[0].notes).toContain("6000x2400mm / 1140mm cover = 6 sheets");
    expect(items[1].notes).toContain("3000x2100mm / 900mm cover = 4 sheets");
  });

  it("uses wall LM for legacy IWP mappings that still reference specArea", () => {
    const items = generateItemsFromSpec(
      [{
        id: 401,
        name: "IWP / Ceiling Panels",
        tabName: "walls",
        specField: "specIwpEntries",
        condition: "!= ''",
        productId: null,
        productMatch: "specIwpEntries",
        qtyFormula: "specArea",
        description: null,
        colourField: "specIwpColour",
        bottomColourField: null,
        uom: "m2",
        sortOrder: 72,
        active: true,
      }],
      {
        specArea: 42,
        specIwpEntries: [
          {
            type: "Panelux Steel/Steel 1140mm",
            width: 6000,
            height: 2400,
          },
        ],
      },
      [product({ id: 20, name: "Panelux Steel/Steel 1140mm", tabName: "walls", coverageWidth: 1140 })],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(14.4);
    expect(items[0].uom).toBe("LM");
  });
});
