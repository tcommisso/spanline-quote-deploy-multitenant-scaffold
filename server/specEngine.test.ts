import { describe, expect, it } from "vitest";
import { generateItemsFromSpec, type ProductLookup, type SpecMapping, type SpecValues, type WindowDoorOptionModifier } from "../shared/specEngine";

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

function windowMapping(overrides: Partial<SpecMapping> = {}): SpecMapping {
  return {
    id: 500,
    name: "Windows from schedule",
    tabName: "windows",
    specField: "specWindowEntries",
    condition: "!= ''",
    productId: null,
    productMatch: "specWindowType",
    qtyFormula: "1",
    description: null,
    colourField: "specWindowsFrameColour",
    bottomColourField: null,
    uom: "ea",
    sortOrder: 74,
    active: true,
    ...overrides,
  };
}

function optionModifier(overrides: Partial<WindowDoorOptionModifier>): WindowDoorOptionModifier {
  return {
    id: 1,
    productType: "window",
    optionGroup: "glass_type",
    optionValue: "Double Glaze",
    adjustmentType: "percent",
    costAdjustmentValue: 0,
    sellAdjustmentValue: 20,
    appliesTo: "base_line",
    label: null,
    notes: null,
    sortOrder: 0,
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

describe("generateItemsFromSpec window and door option modifiers", () => {
  it("expands window schedule entries and adds visible option modifier lines", () => {
    const items = generateItemsFromSpec(
      [windowMapping()],
      {
        specWindowEntries: [
          { style: "Sliding", width: 1200, height: 900, qty: 2, screen: "Security" },
        ],
        specWindowGlassType: "Double Glaze",
        specGlassTint: "Grey",
        specWindowsFrameColour: "Monument",
      },
      [
        product({
          id: 50,
          name: "Sliding Window 1200x900",
          tabName: "windows",
          uom: "ea",
          materials: "300",
          fixedSell: "1000",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
      [
        optionModifier({ id: 1, optionGroup: "glass_type", optionValue: "Double Glaze", sellAdjustmentValue: 20 }),
        optionModifier({ id: 2, optionGroup: "tint", optionValue: "Grey", sellAdjustmentValue: 5, sortOrder: 1 }),
        optionModifier({ id: 3, optionGroup: "screen", optionValue: "Security", adjustmentType: "fixed", sellAdjustmentValue: 75, sortOrder: 2 }),
      ],
    );

    expect(items).toHaveLength(4);
    expect(items[0].productId).toBe(50);
    expect(items[0].description).toBe("Sliding Window 1200x900 - Sliding window 1200x900mm");
    expect(items[0].qty).toBe(2);
    expect(items[0].sellRate).toBe(1000);
    expect(items[0].colour).toBe("Monument");
    expect(items[1].description).toContain("Glass type: Double Glaze");
    expect(items[1].qty).toBe(1);
    expect(items[1].uom).toBe("adj");
    expect(items[1].sellRate).toBe(400);
    const tintLine = items.find(item => item.description.includes("Tint: Grey"));
    const screenLine = items.find(item => item.description.includes("Screen: Security"));
    expect(tintLine?.sellRate).toBe(100);
    expect(screenLine?.qty).toBe(2);
    expect(screenLine?.sellRate).toBe(75);
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

describe("generateItemsFromSpec post fixing matching", () => {
  it("matches the hard-coded post fixing dropdown against the dedicated posts_fixing catalogue tab", () => {
    const items = generateItemsFromSpec(
      [{
        id: 350,
        name: "Post Fixings",
        tabName: "posts_fixing",
        specField: "specPostsFixing",
        condition: "!= ''",
        productId: null,
        productMatch: "specPostsFixing",
        qtyFormula: "specPostsNumber",
        description: null,
        colourField: "specPostsColour",
        bottomColourField: null,
        uom: "ea",
        sortOrder: 51,
        active: true,
      }],
      {
        specPostsFixing: "Welded Base Plate",
        specPostsNumber: 3,
        specPostsColour: "Basal",
      },
      [
        product({
          id: 70,
          name: "Welded Base Plate",
          tabName: "POSTS_FIXING",
          uom: "ea",
          materials: "12",
          installLabour: "6",
          fixedSell: "44",
          coverageWidth: null,
        }),
        product({
          id: 71,
          name: "Welded Base Plate",
          tabName: "posts",
          uom: "ea",
          materials: "1",
          fixedSell: "2",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(70);
    expect(items[0].description).toBe("Welded Base Plate");
    expect(items[0].qty).toBe(3);
    expect(items[0].colour).toBe("Basal");
    expect(items[0].sellRate).toBe(44);
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

describe("generateItemsFromSpec work checklist matching", () => {
  it("expands checked builder-owned checklist rows into product-matched line items", () => {
    const items = generateItemsFromSpec(
      [{
        id: 600,
        name: "Demolition Work Checklist",
        tabName: "demolition",
        specField: "specDemolitionWorkItems",
        condition: "!= ''",
        productId: null,
        productMatch: "workItemProduct",
        qtyFormula: "workItemQty",
        description: null,
        colourField: null,
        bottomColourField: null,
        uom: "ea",
        sortOrder: 150,
        active: true,
      }],
      {
        specDemolitionWorkItems: [
          {
            item: "Demolish existing concrete slab",
            checked: true,
            responsibility: "By Builder",
            qty: 24,
            unit: "m2",
            productMatch: "Demolish existing concrete slab m2",
            notes: "include disposal",
          },
          {
            item: "Remove pavers",
            checked: true,
            responsibility: "By Client",
            qty: 8,
            unit: "m2",
            productMatch: "Paver removal",
          },
          {
            item: "Unchecked task",
            checked: false,
            qty: 2,
          },
        ],
      },
      [
        product({
          id: 60,
          name: "Demolish existing concrete slab m2",
          tabName: "demolition",
          uom: "m2",
          baseCost: "93",
          materials: null,
          installLabour: null,
          consumables: null,
          fixedSell: "207",
          coverageWidth: null,
        }),
        product({
          id: 61,
          name: "Paver removal",
          tabName: "demolition",
          uom: "m2",
          materials: "4",
          fixedSell: "20",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(60);
    expect(items[0].description).toBe("Demolish existing concrete slab m2");
    expect(items[0].qty).toBe(24);
    expect(items[0].uom).toBe("m2");
    expect(items[0].costRate).toBe(93);
    expect(items[0].sellRate).toBe(207);
    expect(items[0].notes).toContain("Work checklist takeoff: Demolish existing concrete slab");
    expect(items[0].notes).toContain("matched product: Demolish existing concrete slab m2");
    expect(items[0].notes).toContain("notes: include disposal");
  });

  it("falls back to the checklist label and a quantity of one when row fields are blank", () => {
    const items = generateItemsFromSpec(
      [{
        id: 601,
        name: "Electrical Work Checklist",
        tabName: "electrical",
        specField: "specElecExtraWork",
        condition: "!= ''",
        productId: null,
        productMatch: "workItemProduct",
        qtyFormula: "workItemQty",
        description: null,
        colourField: null,
        bottomColourField: null,
        uom: "ea",
        sortOrder: 99,
        active: true,
      }],
      {
        specElecExtraWork: [
          { task: "Make safe for works", checked: true, responsibility: "" },
        ],
      },
      [
        product({
          id: 62,
          name: "Make safe for works",
          tabName: "electrical",
          uom: "ea",
          materials: "0",
          installLabour: "95",
          fixedSell: "190",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(62);
    expect(items[0].description).toBe("Make safe for works");
    expect(items[0].qty).toBe(1);
    expect(items[0].sellRate).toBe(190);
  });
});

describe("generateItemsFromSpec electrical light rows", () => {
  it("expands each selected light type row into its own priced item", () => {
    const items = generateItemsFromSpec(
      [{
        id: 700,
        name: "Electrical Lights",
        tabName: "electrical",
        specField: "specElecLightTypes",
        condition: "!= ''",
        productId: null,
        productMatch: "lightType",
        qtyFormula: "lightQty",
        description: null,
        colourField: null,
        bottomColourField: null,
        uom: "ea",
        sortOrder: 90,
        active: true,
      }],
      {
        specElecLightTypes: [
          { type: "LED Oyster", qty: 1 },
          { type: "LED Downlight", qty: 4 },
        ],
      },
      [
        product({
          id: 70,
          name: "LED Oyster",
          tabName: "electrical",
          subTab: "Lights",
          uom: "ea",
          materials: "55",
          installLabour: "20",
          fixedSell: "165",
          coverageWidth: null,
        }),
        product({
          id: 71,
          name: "LED Downlight",
          tabName: "electrical",
          subTab: "Lights",
          uom: "ea",
          materials: "40",
          installLabour: "15",
          fixedSell: "125",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ productId: 70, description: "LED Oyster", qty: 1, sellRate: 165 });
    expect(items[1]).toMatchObject({ productId: 71, description: "LED Downlight", qty: 4, sellRate: 125 });
    expect(items[1].notes).toContain("Light takeoff: LED Downlight");
  });

  it("uses light rows for legacy aggregate light mappings when row data exists", () => {
    const items = generateItemsFromSpec(
      [{
        id: 701,
        name: "Electrical Lights",
        tabName: "electrical",
        specField: "specElecLights",
        condition: "> 0",
        productId: null,
        productMatch: "specElecLightType",
        qtyFormula: "specElecLights",
        description: "Electrical Lights",
        colourField: null,
        bottomColourField: null,
        uom: "ea",
        sortOrder: 90,
        active: true,
      }],
      {
        specElecLights: 5,
        specElecLightTypes: [
          { type: "LED Oyster", qty: 1 },
          { type: "LED Downlight", qty: 4 },
        ],
      },
      [
        product({
          id: 72,
          name: "LED Oyster",
          tabName: "electrical",
          uom: "ea",
          fixedSell: "165",
          coverageWidth: null,
        }),
        product({
          id: 73,
          name: "LED Downlight",
          tabName: "electrical",
          uom: "ea",
          fixedSell: "125",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(2);
    expect(items.map(item => item.qty)).toEqual([1, 4]);
    expect(items.map(item => item.productId)).toEqual([72, 73]);
    expect(items[0].description).toBe("Electrical Lights - LED Oyster");
  });
});

describe("generateItemsFromSpec electrical GPO rows", () => {
  it("prefers IWP-specific products when the GPO row is marked for IWP", () => {
    const items = generateItemsFromSpec(
      [{
        id: 800,
        name: "Electrical GPOs",
        tabName: "electrical",
        specField: "specElecGpos",
        condition: "!= ''",
        productId: null,
        productMatch: "gpoType",
        qtyFormula: "gpoQty",
        description: null,
        colourField: null,
        bottomColourField: null,
        uom: "ea",
        sortOrder: 93,
        active: true,
      }],
      {
        specElecGpos: [
          { type: "Double GPO", location: "Indoor", qty: 2, onIwp: true },
        ],
      },
      [
        product({
          id: 80,
          name: "Double GPO Indoor",
          tabName: "electrical",
          subTab: "gpo's",
          uom: "ea",
          fixedSell: "40",
          coverageWidth: null,
        }),
        product({
          id: 81,
          name: "Double GPO Indoor IWP",
          tabName: "electrical",
          subTab: "gpo's",
          uom: "ea",
          fixedSell: "289",
          coverageWidth: null,
        }),
      ],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: 81, description: "Double GPO Indoor IWP", qty: 2, sellRate: 289 });
    expect(items[0].notes).toContain("install on IWP");
  });
});

describe("generateItemsFromSpec additional cost selections", () => {
  it("adds selected priced additional costs as quote item rows without requiring mappings", () => {
    const items = generateItemsFromSpec(
      [],
      {
        specChecklistSelections: [
          {
            itemId: 1,
            label: "Professional Site Clean",
            unitPrice: 800,
            qty: 1,
            total: 800,
            section: "Finishing",
            unit: "each",
          },
          {
            itemId: 2,
            label: "Mobile Scaffold per day",
            unitPrice: 200,
            qty: 5,
            total: 1000,
            section: "Site Works",
            unit: "each",
          },
        ],
      },
      [],
      {},
      2.2,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      specMappingId: null,
      productId: null,
      tabName: "additional_costs",
      description: "Professional Site Clean",
      qty: 1,
      uom: "each",
      costRate: 800,
      sellRate: 800,
    });
    expect(items[1]).toMatchObject({
      description: "Mobile Scaffold per day",
      qty: 5,
      costRate: 200,
      sellRate: 200,
    });
    expect(items[1].notes).toContain("Additional cost section: Site Works");
  });

  it("does not emit section work checklist rows as additional costs", () => {
    const items = generateItemsFromSpec(
      [],
      {
        specChecklistSelections: [
          {
            itemId: 10,
            label: "Demolish existing concrete slab",
            unitPrice: 207,
            qty: 20,
            total: 4140,
            section: "demolition",
            unit: "m2",
          },
          {
            itemId: 11,
            label: "Mobile Scaffold per day",
            unitPrice: 200,
            qty: 5,
            total: 1000,
            section: "site_works",
            unit: "each",
          },
        ],
      },
      [],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tabName: "additional_costs",
      description: "Mobile Scaffold per day",
      qty: 5,
      sellRate: 200,
    });
  });

  it("derives unit price from saved line total when only a total is available", () => {
    const items = generateItemsFromSpec(
      [],
      {
        specChecklistSelections: [
          { label: "Demolish existing concrete slab", qty: 20, total: 4140, unit: "m2" },
          { label: "Bobcat per day", qty: 2, total: 400, unit: "each", section: "site_works" },
        ],
      },
      [],
      {},
      2.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "Bobcat per day", qty: 2, sellRate: 200 });
  });
});
