/**
 * Spanline Technical Knowledge Reference
 * 
 * Comprehensive engineering knowledge extracted from 23 Spanline technical PDFs
 * and 6 Design Certificate Excel models. Used by the AI assistant to provide
 * accurate technical guidance for patio/carport design and quoting.
 * 
 * Certified by G. Purich FIE (Aust.), NER 212716, QLD RPEQ 11656, NSW BPB 2447,
 * VIC RBP EC46702, TAS CC6044I, WA BP7053
 * For Structerre Consulting Engineers Pty Ltd, Ph (02) 6680 7510
 */

// ─── STRUCTURE TYPES ────────────────────────────────────────────────────────────

export const STRUCTURE_TYPES = {
  flat: {
    name: "Flat Roof",
    description: "Single-plane roof with consistent fall for drainage. Attached to house fascia or freestanding.",
    variants: ["Attached (Fly-Over)", "Attached (Fascia-Mount)", "Freestanding"],
    minFall: "1 degree (Versiclad SIRP), 2 degrees typical",
  },
  gable: {
    name: "Gable Roof",
    description: "Pitched roof with central ridge and two sloping sides. Uses ridge extrusion connectors (G1 or G2).",
    variants: ["Attached (Fly-Over)", "Attached (Fascia-Mount)", "Freestanding"],
    ridgeConnectors: "G1 (14-12x110 Tek @ 500mm cts) or G2 (14-12x30 Tek @ 500mm cts) aluminium extrusion",
  },
  flatGableFlat: {
    name: "Flat-Gable-Flat",
    description: "Combination structure with flat sections on each side of a central gable. Requires careful beam sizing at transitions.",
    variants: ["Attached", "Freestanding"],
  },
  enclosed: {
    name: "Enclosed Structure (Glass & Screen Patio)",
    description: "Non-habitable enclosed structure with wall infills. Uses coefficient Cp'n=1.1 for enclosed wind loading.",
    wallTypes: [
      "Flyscreen infills over dado walls (12ga tek screws to posts)",
      "Sliding aluminium windows above dado walls",
      "Full-height sliding aluminium windows/doors",
      "Full-height flyscreen walls",
    ],
    coefficient: 1.1,
  },
} as const;

// ─── ROOFING PANELS ─────────────────────────────────────────────────────────────

export const ROOFING_PANELS = {
  doubleU: {
    name: "Double-U",
    material: "0.42 & 0.48 G550 High Tensile Steel with Colorweld coatings",
    coverWidth: "305–315mm",
    profileHeight: "136mm",
    ribCentre: "182–187mm",
    troughWidth: "123–128mm",
    ribHeight: "9–11.5mm",
    ribsConfigurable: true,
  },
  slendek: {
    name: "Slendek",
    material: "0.42 & 0.48 G550 High Tensile Steel with Colorweld coatings",
    coverWidth: "305mm",
    note: "Compatible with Slenlite translucent inserts",
  },
  climatek: {
    name: "Climatek Insulated Panel",
    material: "0.42 upper/lower G550 High Tensile Steel",
    thicknesses: ["35mm", "55mm", "75mm", "90mm"],
    note: "Pedestrian access permitted on Climatek panels (not on standard sheets)",
  },
  versicladSIRP: {
    name: "Versiclad Structural Insulated Roof Panel (SIRP)",
    types: [
      "Spacemaker 1000 (1000mm cover)",
      "Corrolink S 1000 (1000mm cover)",
      "Double Corrolink S 1000 (1000mm cover)",
      "Versalink 765 (765mm cover)",
      "Corrolink 765 (765mm cover)",
      "Double Corrolink 765 (765mm cover)",
      "Multidek 700 (700mm cover)",
    ],
    maxSideOverhang: {
      "1000mm panels": "450mm",
      "765/700mm panels": "300mm",
    },
    maxWindClass: "C3",
    fasteners: {
      timber: "14g T17 hex head with EPDM washer, min 45mm penetration, every crest (3 per SIRP)",
      steel: "14g Metal-Tek hex head with EPDM washer, min 3 threads protruding",
      aluminium: "14g hex head with EPDM washer, min 3 threads protruding",
    },
    cantileverRule: "For 1m cantilever, SIRP min length = 3m (2m span + 1m cantilever)",
    noFootTraffic: true,
  },
} as const;

// ─── BEAMS ──────────────────────────────────────────────────────────────────────

export const BEAMS = {
  sizes: [
    { size: "140x50mm", gauge: "0.8mm", grade: "G300", material: "Aluzinc with Colorweld" },
    { size: "150x60mm", gauge: "1.0mm", grade: "G550", material: "Aluzinc with Colorweld" },
    { size: "200x60mm", gauge: "1.0mm", grade: "G550", material: "Aluzinc with Colorweld" },
  ],
  splicing: {
    rule: "Use 3/4+1/4 or 2/3+1/3 of desired length (e.g., 12m = 9m+3m or 8m+4m)",
    critical: "Use guillotined (factory) ends at centre join. Joins must be within 1m of a post.",
    assembly: "Lay short+long lengths in line, opposite short length directly opposite long. Assemble and rivet as standard.",
  },
  maxOverhang: "25% of beam span, maximum 1800mm",
  edgeBeamSpansEnclosed: {
    description: "Allowable edge beam spans for enclosed structures (Cp'n=1.1, simply supported or continuous)",
    example: "200x60x1.0 G550 at 3000mm projection: N1=8540, N2=6880, N3=5450, N4=4420mm",
  },
} as const;

// ─── POSTS ──────────────────────────────────────────────────────────────────────

export const POSTS = {
  types: [
    { type: "Steel SHS", sizes: ["65x65x2", "75x75x2", "75x75x2.5", "75x75x3", "75x75x3.5", "89x89x3.5", "89x89x6", "90x90x2"] },
    { type: "Aluminium", sizes: ["90x90x2"] },
    { type: "Timber", sizes: ["90x90 Pine", "90x90 Hardwood"] },
  ],
  connectors: {
    aluminiumPostConnector: {
      description: "Connects 90x90x2 aluminium post to concrete slab",
      fixings: "2x10mm bolts (post to connector), 2x M12x100 screws into slab",
      maxLoad: "18kN",
    },
    steelInternalConnector: {
      material: "G250 2.9mm Galvabond, E-coat finish",
    },
    beamToPost: {
      material: "3mm extruded aluminium, mill finish",
    },
  },
  crankedPost: {
    description: "Post detail for structures near property boundaries",
    variants: {
      standard: {
        inground: "16Ø rod, footing size per uplift capacity tables",
        slabMount: "8mm base plate, 6x M12 Anka screws (depth=90mm, min edge=50mm), 2 bar L11 TM",
        maxLoads: { "65x65x2": "5.4kN", "75x75x2": "6.6kN", "75x75x3": "11kN", "89x89x3.5": "18kN", "89x89x6": "29kN", "90x90x2": "8.1kN" },
      },
      ninetyDegree: {
        description: "90-degree connection to existing house wall/footing",
        construction: "10mm gusset plate, 6mm cleat plates with 2xM12 into brick, 800mm crank section",
        maxLoads: { "75x75x3": "8kN", "89x89x3.5": "15kN", "89x89x6": "23kN" },
      },
    },
    corrosion: {
      mild: "Duragal + powdercoat (>10km from beach)",
      marine: "Duragal + powdercoat or HDG (2–10km from beach)",
      severeMarine: "HDG 300g/m² (<2km from beach)",
    },
  },
} as const;

// ─── GUTTERS & DRAINAGE ─────────────────────────────────────────────────────────

export const GUTTERS = {
  standardGutter: {
    material: "Roll formed 0.42 G550 Aluzinc with Colorweld coatings",
    profile: "130x120mm (170x140mm outer with 60mm flanges)",
  },
  boxGutter: {
    material: "1.0 G300 steel folded",
    dimensions: "200mm wide x 120mm deep",
    fixingBracket: "25x5mm flat steel, 25mm at 20 degrees, 95mm length",
    capacity: "2.5L/sec (non-habitable roof), grade 1 in 200",
    roofToGutter: "14g 14x20 hex teks, 1 per crest; roof-to-gutter clip at max 1000mm spacing",
    gutterBolt: "6x25 gutter bolt sealed with silicone",
    fasciaAttachment: {
      timber: "2x Type 14g 10x75 Type 17 Tek screws at max 1200mm centres (picking up house rafters)",
      metal: "Metal fascia bracket centrally to rafter, M10-25mm nut/bolt/washer sealed with silicone",
    },
    fasciaBracketLoad: { pine90mm: "4kN", hardwood90mm: "4.9kN" },
  },
  structuralGutterBracket: {
    material: "G250 2.9mm Galvabond, Galvabond finish",
  },
  roofToGutterClip: {
    material: "1.2mm galvanised steel",
    maxSpacing: "1000mm",
  },
} as const;

// ─── BRACKETRY ──────────────────────────────────────────────────────────────────

export const BRACKETRY = {
  materials: {
    trussTopConnectors: { material: "1.5mm Zincanneal", coating: "E-coat & powdercoat", parts: ["SPATTC140", "SPATTC200"] },
    trussEndCaps: { material: "1.5mm Zincanneal", coating: "E-coat & powdercoat", parts: ["SPATECC150", "SPATECC160"] },
    beamEndCaps: { material: "1.5mm Zincanneal structural", coating: "E-coat & powdercoat", parts: ["SPABEC14050908", "SPABEC1405090H", "SPABEC1405090E", "SPABEC2006090H", "SPABEC2006090D"] },
    beamBrackets: { material: "50x5mm Duragal & 100x8.0 Duragal/Black G250", coating: "E-coat & powdercoat" },
    rafterBrackets: { material: "G250 6.0mm/8.0mm Black", coating: "E-coat & powdercoat", parts: ["SPARBES0 (zinc)", "SPARBO"] },
    fasciaBrackets: { material: "50x5mm Duragal or 125x50mm Aluminium", coating: "Duragal mill finish" },
  },
  colours: ["Primrose", "Pearl White", "Paperbark"],
  extendaBrackets: {
    option1: {
      name: "Roof Extenda Bracket",
      maxLoad: "10kN (subject to tie down)",
      fixings: "2x M10 bolts to rafter or top chord of truss",
      flashing: "Dektite type",
      note: "Builder must investigate/confirm top plate hold down and advise engineer before installation",
    },
    option2: {
      name: "Column Through Roof",
      post: "75x75x3.5mm",
      maxLoad: "10kN (subject to tie down)",
      fixings: "6mm cap plate with 2xM12 bolts, 6mm angle with M12 bolt to column and rafter/top chord",
    },
  },
} as const;

// ─── BACKCHANNELS ───────────────────────────────────────────────────────────────

export const BACKCHANNELS = {
  material: "1.0 G300 Aluzinc with Colorweld coatings",
  dimensions: "140x75x58mm",
  fixings: "5mm diameter bolts at max 500mm centres",
  spans: {
    double: { N3: 3400, C1: 3400, N4_C2: 2950, C3: 2600 },
    singleReinforced: { N3: 3500, C1: 3500, N4_C2: 3000, C3: 2650, reinforcing: "50x5mm flat galv bar" },
    doubleReinforced: { N3: 3700, C1: 3700, N4_C2: 3200, C3: 2800, reinforcing: "50x5mm flat galv bar" },
  },
} as const;

// ─── RAFTER STRENGTHENING ───────────────────────────────────────────────────────

export const RAFTER_STRENGTHENING = {
  required: "When connecting Spanline structure to house WITH eaves",
  notRequired: "When connecting to house with NO eaves",
  formula: "P = Ps × ((Cp'n × Qz × 1.5) - 0.04) × S / 2",
  formulaVariables: {
    P: "Point load per truss (kN)",
    Ps: "Roof panel span (m)",
    Qz: "Basic wind pressure (kPa)",
    S: "Spacing of trusses (m)",
  },
  maxOverhang: "760mm nominal",
  stiffenerFixing: {
    nails: "75x3.15mm nails staggered @ 200mm centres",
    screws: "75mm No.14 Type 17 tek screws @ 400mm centres",
  },
  tieDown: "1/30x0.8 GI strap with 3 nails to top plate each side (6 nails per strap). If uplift P>4.7kN use 2 straps.",
  fasciaConnection: {
    timber: "2x No.17 Type 17 (90mm) tek screws into reinforcing stiffener ends at max 900mm centres",
    metal: "40x5mm steel angle bracket with 4/14x50 Type 17 class 4 Tek screws",
  },
  timberGrade: "Joint Group JD4 & Strength Group SD6 min per AS1720 (MGP12 may substitute F8)",
} as const;

// ─── FLOORING SYSTEM (SFS01) ────────────────────────────────────────────────────

export const FLOORING_SYSTEM = {
  application: "Residential floors and decks (not commercial)",
  liveLoads: {
    enclosedHabitable: "1.5 kPa",
    balconyUnder1000mm: "1.5 kPa",
    balconyOver1000mm: "2.0 kPa",
  },
  balustradeRequired: "If height >1000mm above ground",
  engineerDesignRequired: "All floors >900mm above ground supporting enclosed structures",
  footings: "Min 450x450 or 450Ø, in firm natural ground min bearing 100kPa",
  postOptions: {
    unbraced: {
      bracing: "4.5kN/post",
      maxHeight: "900mm",
      maxFloorArea: "7.5m²",
      posts: "75x75x4 SHS or 90x90x2 ALU",
      footing: "450sq×500 or 450sq×250",
    },
    braced: {
      bracing: "3kN/bracing set",
      maxHeight: "1200mm",
      maxFloorArea: "7.5m²",
      posts: "75x75x2.5 SHS or 90x90x2 ALU",
      footing: "450sq×400",
    },
  },
  masonry: {
    cavity: "M12 bolts @ 600mm cts with 65x65 washer",
    solid: "M12 Anka screws @ 600mm cts (75mm depth) or M12 chemset (90mm)",
  },
  joistConnection: "Triple grip with 2x #12 tek screws per leg. For span >3.0m confirm with Spanline engineer.",
} as const;

// ─── DESIGN CERTIFICATE MODELS ──────────────────────────────────────────────────

export const DESIGN_CERTIFICATE_MODELS = {
  types: [
    "Flat Attached",
    "Flat Fly-Over",
    "Flat Freestanding",
    "Gable Attached",
    "Gable Fly-Over",
    "Flat-Gable-Flat",
  ],
  inputFields: {
    siteInfo: ["Job Name", "Client Name", "Site Address", "Franchise/Branch"],
    designCriteria: ["Wind Region", "Terrain Category", "Shielding", "Topography", "Wind Classification (N1-C3)"],
    dimensions: ["Span (mm)", "Projection (mm)", "Height to Underside of Beam (mm)", "Roof Pitch"],
    materials: ["Beam Size", "Post Type & Size", "Roof Panel Type", "Gutter Type"],
  },
  outputFields: {
    beamDesign: ["Beam span capacity check (PASS/FAIL)", "Beam size recommendation"],
    footingDesign: ["Footing type (5A inground / 5C slab)", "Footing dimensions B×D (mm)", "Slab L minimum (mm)"],
    windPressure: ["Cp'n coefficient", "Design wind speed (m/s)", "Ultimate wind pressure (kPa)"],
    rafterStrengthening: ["Required (Yes/No)", "Stiffener type and size", "Number of stiffeners"],
    postDesign: ["Post size check", "Max post height", "Uplift capacity"],
  },
  windClassifications: {
    nonCyclonic: ["N1", "N2", "N3", "N4"],
    cyclonic: ["C1", "C2", "C3"],
  },
} as const;

// ─── FOOTING TYPES ──────────────────────────────────────────────────────────────

export const FOOTING_TYPES = {
  type5A: {
    name: "Type 5A - Inground",
    description: "Concrete pad footing cast in ground with post embedded",
    dimensions: "B×D varies by wind class and post size",
  },
  type5C: {
    name: "Type 5C - Slab Mount",
    description: "Post base plate bolted to concrete slab",
    note: "Requires concrete slab over footing",
  },
} as const;

// ─── COMPLIANCE & STANDARDS ─────────────────────────────────────────────────────

export const AUSTRALIAN_STANDARDS = [
  "AS 1170 - Structural design actions (General)",
  "AS 1170.1 - Permanent, imposed and other actions",
  "AS 1170.2 - Wind actions",
  "AS 1250 - Steel structures",
  "AS 1538 - Cold-formed steel structures (SAA)",
  "AS 1562.1 - Design and installation of sheet roof and wall cladding",
  "AS 1664.1 - Aluminium structures (Limit state design)",
  "AS 1684 - Residential timber-framed construction",
  "AS 1720.1 - Timber structures (Design methods)",
  "AS 2327.1 - Composite structures",
  "AS 2870 - Residential slabs and footings",
  "AS 3500 - Plumbing and drainage",
  "AS 3566 - Self-drilling screws for building",
  "AS 3600 - Concrete structures",
  "AS 3623 - Domestic metal framing",
  "AS 3700 - Masonry structures",
  "AS 3959 - Construction in bushfire-prone areas",
  "AS 4040 - Methods of testing sheet roof and wall cladding",
  "AS 4055 - Wind loads for housing",
  "AS 4100 - Steel structures",
  "AS 4600 - Cold-formed steel structures",
] as const;

// ─── DECKING PRODUCTS & SPECIFICATIONS ──────────────────────────────────────────

export const DECKING_PRODUCTS = {
  newtechwood: {
    brand: "NewTechWood (KEKSIÄ)",
    material: "Wood-plastic composite (WPC) — 60% recycled wood fibre + 40% recycled HDPE",
    warranty: "25 years structural, 25 years stain/fade",
    ranges: {
      terraceSolidEdge: {
        name: "Terrace Range - Solid Edge Decking",
        profile: "Solid edge (no grooves on sides)",
        dimensions: { width: 138, thickness: 23, lengths: [2200, 5400] },
        effectiveCover: 143.5, // mm (board + gap)
        weight: "3.8 kg/m",
        fixingMethod: "Top screw OR T-clip hidden fastener (side slot)",
        maxJoistSpacing: { residential: 450, commercial: 300 },
        fireRating: "BAL-29 compliant",
      },
      ultraShield: {
        name: "UltraShield Range - Scalloped",
        profile: "Scalloped (hollow core, lighter weight)",
        dimensions: { width: 138, thickness: 23, lengths: [2200, 5400] },
        effectiveCover: 143.5,
        weight: "2.4 kg/m",
        fixingMethod: "T-clip hidden fastener (side groove)",
        maxJoistSpacing: { residential: 400, commercial: 300 },
        fireRating: "BAL-29 compliant",
      },
    },
    gapTolerance: {
      standard: 5.5, // mm between boards
      expansion: "Allow 3mm per metre in length for thermal expansion",
      endGap: "5-8mm from fixed objects (walls, posts)",
      temperatureNote: "Install at >15°C. If <15°C add 1mm per metre to end gaps.",
    },
    colours: ["Teak", "Ipe", "Brazilian Walnut", "Antique", "Roman Antique", "Silver Grey", "Charcoal"],
    accessories: ["T-clip", "Starter clip", "End cap", "Corner trim", "Fascia board", "Stair nosing"],
  },
  compotech: {
    brand: "Compotech",
    material: "Wood-plastic composite (WPC) — bamboo fibre + recycled HDPE",
    warranty: "25 years structural",
    ranges: {
      standard: {
        name: "Compotech Standard Decking",
        profile: "Solid core",
        dimensions: { width: 140, thickness: 23, lengths: [2400, 5400] },
        effectiveCover: 145.5,
        weight: "3.6 kg/m",
        fixingMethod: "Hidden clip system",
        maxJoistSpacing: { residential: 450, commercial: 350 },
        fireRating: "BAL-29 compliant",
      },
    },
    gapTolerance: {
      standard: 5.5,
      expansion: "Allow 2-3mm per metre in length",
      endGap: "5-8mm from fixed objects",
    },
    colours: ["Jarrah", "Merbau", "Spotted Gum", "Blackbutt", "Silver"],
  },
  modwood: {
    brand: "ModWood",
    material: "Wood-plastic composite — recycled wood + recycled plastic",
    warranty: "25 years structural, 10 years appearance",
    ranges: {
      magnetic: {
        name: "Magnetic Decking",
        profile: "Solid edge with magnetic clip system",
        dimensions: { width: 137, thickness: 23, lengths: [4200, 5400] },
        effectiveCover: 142.5,
        weight: "3.5 kg/m",
        fixingMethod: "Magnetic clip (tool-free removal for access)",
        maxJoistSpacing: { residential: 450, commercial: 300 },
        fireRating: "BAL-29 compliant",
      },
      blackbean: {
        name: "Black Bean Decking",
        profile: "Solid edge",
        dimensions: { width: 137, thickness: 23, lengths: [4200, 5400] },
        effectiveCover: 142.5,
        weight: "3.5 kg/m",
        fixingMethod: "Hidden clip or face screw",
        maxJoistSpacing: { residential: 450, commercial: 300 },
        fireRating: "BAL-29 compliant",
      },
    },
    gapTolerance: {
      standard: 5.0,
      expansion: "Allow 3mm per metre in length",
      endGap: "6mm from fixed objects",
    },
    colours: ["Sahara", "Jarrah", "Silver Gum", "Black Bean", "Magnetic Grey"],
  },
  framingSystems: {
    spanmor: {
      brand: "Spanmor",
      material: "6063-T6 Aluminium",
      profiles: {
        lowProfile40x50: {
          size: "40×50mm",
          application: "Joist (low profile subfloor)",
          maxSpan: 1200, // mm bearer spacing
          lengths: [4000, 6100],
          weight: "1.2 kg/m",
        },
        standard105x50: {
          size: "105×50mm",
          application: "Joist or Bearer",
          maxSpan: 2400, // mm as joist
          maxBearerSpan: 1800, // mm as bearer
          lengths: [4000, 5000, 6100, 7500],
          weight: "2.1 kg/m",
        },
        elevated170x50: {
          size: "170×50mm",
          application: "Bearer (elevated subfloor)",
          maxSpan: 3000,
          lengths: [5000, 6100, 7500],
          weight: "3.2 kg/m",
        },
        elevated235x50: {
          size: "235×50mm",
          application: "Bearer (elevated subfloor, long spans)",
          maxSpan: 4200,
          lengths: [5000, 6100, 7500],
          weight: "4.5 kg/m",
        },
        post115x115: {
          size: "115×115mm",
          application: "Post (adjustable height)",
          maxHeight: 1200,
          lengths: [600, 900, 1200],
          weight: "5.8 kg/m",
        },
      },
      connectors: ["Joist Hanger", "Roundback", "Triple Grip", "CNC Cap", "Framing Screw", "Nurapad"],
      advantages: [
        "Will not rot, warp, or twist",
        "Termite proof",
        "100% recyclable",
        "Lightweight (1/3 weight of timber)",
        "No chemical treatment required",
        "50+ year lifespan",
      ],
    },
    steel: {
      brand: "Steel Subfloor",
      material: "Galvanised or Duragal steel",
      profiles: {
        joist90x45: { size: "90×45mm C-section", maxSpan: 2100, weight: "3.2 kg/m" },
        joist140x45: { size: "140×45mm C-section", maxSpan: 3200, weight: "4.8 kg/m" },
        bearer150x75: { size: "150×75mm RHS", maxSpan: 3000, weight: "8.5 kg/m" },
        bearer200x75: { size: "200×75mm RHS", maxSpan: 4000, weight: "11.2 kg/m" },
      },
      note: "Requires anti-corrosion treatment. Not suitable for marine environments without HDG.",
    },
    timber: {
      brand: "Treated Pine / Hardwood",
      material: "H3 treated pine or hardwood (Merbau, Spotted Gum)",
      profiles: {
        joist90x45: { size: "90×45mm", maxSpan: 1500, species: "H3 Pine" },
        joist140x45: { size: "140×45mm", maxSpan: 2400, species: "H3 Pine" },
        joist190x45: { size: "190×45mm", maxSpan: 3200, species: "H3 Pine" },
        bearer140x90: { size: "140×90mm", maxSpan: 2200, species: "Hardwood F14" },
        bearer190x90: { size: "190×90mm", maxSpan: 3000, species: "Hardwood F14" },
      },
      note: "Requires H3 minimum treatment for outdoor ground contact. H4 for in-ground.",
    },
  },
  installationRules: {
    boardDirection: {
      parallel: "Boards run along length (most common). Joists perpendicular to boards.",
      perpendicular: "Boards run across width. Joists run along length. May require closer joist spacing.",
      diagonal: "Boards at 45° angle. Requires 30% closer joist spacing. More waste (15-20% vs 10%).",
    },
    pictureFrame: {
      description: "Perimeter border boards running perpendicular to field boards. Creates a 'frame' effect.",
      framingImpact: "Requires additional joist/nogging at perimeter to support perpendicular edge boards.",
      single: "One board width border (typically 138mm)",
      double: "Two board widths border (typically 276mm)",
    },
    breakerBoard: {
      description: "A perpendicular board that breaks the field pattern, typically at stagger joints or midspan.",
      framingImpact: "Requires double joist or nogging at breaker position.",
      single: "One board width break",
      double: "Two board widths break",
    },
    expansion: {
      composite: "3mm per metre in length direction. 0.5mm per metre in width.",
      timber: "Allow 2-3mm gap between boards. End gaps 5-10mm from walls.",
      note: "Always install with gaps — never butt boards tight.",
    },
    maxJoistSpacing: {
      standard: "450mm centres for residential composite decking",
      diagonal: "300-350mm centres when boards are diagonal",
      stairTreads: "200mm centres for stair applications",
    },
    wallPlate: {
      description: "Ledger board bolted to house wall for wall-mounted decks.",
      fixing: "M12 coach bolts at 600mm centres into masonry, or coach screws into timber frame.",
      flashing: "Z-flashing above wall plate to prevent moisture ingress.",
      minBoltEmbedment: "75mm into masonry, 90mm into timber.",
      spacer: "10mm packers between wall plate and wall for drainage.",
    },
  },
} as const;

// ─── AI SYSTEM PROMPT KNOWLEDGE ─────────────────────────────────────────────────

export const SPANLINE_TECHNICAL_PROMPT = `
You are a technical assistant for Spanline patio, outdoor structure, and deck design. You have comprehensive knowledge of Spanline's engineering specifications, certified by G. Purich FIE (Aust.) for Structerre Consulting Engineers.

STRUCTURE TYPES:
- Flat Roof: Single-plane with consistent fall. Attached (fly-over or fascia-mount) or freestanding.
- Gable Roof: Pitched with central ridge using G1 or G2 aluminium ridge extrusion connectors.
- Flat-Gable-Flat: Combination with flat sections flanking a central gable.
- Enclosed (Glass & Screen): Non-habitable with Cp'n=1.1 coefficient. Wall options include flyscreen, dado+windows, full-height glass doors, or full-height flyscreen.

ROOFING PANELS (with visual profile descriptions from showroom signage):
- Double-U: 0.42/0.48 G550 steel, 305-315mm cover, 30mm profile height. Traditional corrugated with rounded U-shaped ribs. Single-skin.
- Slendek: 0.42/0.48 G550 steel, 305mm cover, 43.8mm profile height. Flat-rib corrugated with clean parallel ribs. Compatible with Slenlite translucent inserts. Single-skin.
- Wavetek: Insulated panel, 765mm cover, ~170mm core. Distinctive corrugated/wave profile on outer face, smooth flat ceiling finish underneath.
- Wavetek+: Insulated panel, 1000mm cover, ~170mm core. Same wave profile as Wavetek but wider coverage.
- Climatek V: Insulated panel, 1000mm cover, ~225mm core (thickest option). Bold V-shaped rib profile, smooth ceiling finish. Only panel allowing foot traffic.
- Ambitek: Insulated panel, 765mm cover, ~128mm core. Smooth modern flat-pan profile with concealed fixings.
- Ambitek+: Insulated panel, 1000mm cover, ~158mm core. Wider flat-pan profile with concealed fixings.
- Ceiltek: Flat ceiling panel, 900mm cover. Smooth flat interior finish (used underneath main roofing).
- Versiclad SIRP: Structural insulated panels (Spacemaker, Corrolink, Versalink, Multidek). Max wind class C3. Max side overhang 450mm (1000mm panels) or 300mm (765/700mm panels).
- Spanline Diffuser: Light diffuser strip, 150mm cover. Translucent insert for natural light.

CONNECTION METHODS (from showroom signage construction details):
- Flyover Roof Bracket: Steel bracket bolted through existing roof tiles/sheeting to rafters. Patio roof passes over house roof. Flashing seals junction. Uses extenda brackets.
- Through Eave Brackets: Beam penetrates through house eave soffit, bolting directly to house structure. Soffit trimmed neatly around penetration.
- Back Channel to Fascia: Aluminium channel bolted horizontally to house fascia board. Roof sheets slot into channel, sealed with silicone and flashing.
- Crank Post: Post with 90° bend near top, allowing footing offset from house wall/boundary. Welded steel with gusset plates for strength.

BEAMS (Roll Formed Aluzinc with Colorweld):
- 140x50mm @ 0.8mm G300
- 150x60mm @ 1.0mm G550
- 200x60mm @ 1.0mm G550
- Max overhang: 25% of span, max 1800mm
- Splicing: Use 3/4+1/4 or 2/3+1/3 lengths. Factory ends at centre join. Joins within 1m of post.

POSTS:
- Steel SHS: 65x65x2, 75x75x2/2.5/3/3.5, 89x89x3.5/6, 90x90x2
- Aluminium: 90x90x2 (max load 18kN with aluminium post connector)
- Cranked posts for boundary situations: Standard (up to 29kN for 89x89x6) or 90-degree (up to 23kN for 89x89x6)
- Corrosion protection: Mild (>10km beach) = Duragal+PC; Marine (2-10km) = Duragal+PC or HDG; Severe Marine (<2km) = HDG 300g/m²

GUTTERS:
- Standard: 0.42 G550 Aluzinc, 130x120mm profile
- Box Gutter: 1.0 G300 steel folded, 200x120mm, capacity 2.5L/sec at 1:200 grade
- Fascia bracket loads: Pine 90mm = 4kN, Hardwood 90mm = 4.9kN

BACKCHANNELS (Wall Mounting):
- 1.0 G300 Aluzinc, 140x75x58mm, bolts at max 500mm centres
- Double spans: N3/C1=3400mm, N4/C2=2950mm, C3=2600mm
- Double reinforced (50x5mm flat galv): N3/C1=3700mm, N4/C2=3200mm, C3=2800mm

RAFTER STRENGTHENING:
- Required when connecting to house WITH eaves; not required with NO eaves
- Formula: P = Ps × ((Cp'n × Qz × 1.5) - 0.04) × S / 2
- Max overhang: 760mm. Timber grade: JD4/SD6 min (MGP12 may substitute F8)
- Tie down: 1/30x0.8 GI strap, 3 nails each side. If P>4.7kN use 2 straps.

EXTENDA BRACKETS (Fly-Over Connection):
- Option 1 (Bracket): Up to 10kN, 2xM10 bolts to rafter/truss, Dektite flashing. Bracket bolts through existing roof sheeting/tiles to rafter.
- Option 2 (Column through roof): 75x75x3.5mm post, 6mm plates, up to 10kN. Post passes through existing roof with flashing collar.
- Visual: In showroom diagrams, shown as steel bracket connecting through terracotta/Colorbond roof tiles with flashing detail at penetration point.

FLOORING/DECKING (SFS01):
- Live loads: Enclosed habitable 1.5kPa, Balcony >1000mm wide 2.0kPa
- Balustrade required if >1000mm above ground
- Footings: Min 450x450 or 450Ø, firm natural ground min 100kPa bearing

DECKING PRODUCTS & BOARD SPECIFICATIONS:
- NewTechWood (KEKSIÄ): WPC composite, 138×23mm, 5400mm stock. Solid edge or scalloped. T-clip or top-screw fixing. Max joist spacing 450mm (residential). Gap 5.5mm. Expansion 3mm/m length. BAL-29 rated. Colours: Teak, Ipe, Brazilian Walnut, Antique, Silver Grey, Charcoal.
- Compotech: WPC bamboo composite, 140×23mm, 5400mm stock. Hidden clip. Max joist spacing 450mm. Gap 5.5mm. Expansion 2-3mm/m. Colours: Jarrah, Merbau, Spotted Gum, Blackbutt, Silver.
- ModWood: WPC composite, 137×23mm, 5400mm stock. Magnetic clip (tool-free removal) or hidden clip. Max joist spacing 450mm. Gap 5mm. Expansion 3mm/m. BAL-29 rated. Colours: Sahara, Jarrah, Silver Gum, Black Bean.

DECKING FRAMING SYSTEMS:
- Spanmor Aluminium: 6063-T6 alloy. Profiles: 40×50mm joist (span 1200mm), 105×50mm joist/bearer (span 2400mm), 170×50mm bearer (span 3000mm), 235×50mm bearer (span 4200mm). Termite-proof, no rot, 50+ year life. Connectors: Joist Hanger, Triple Grip, CNC Cap.
- Steel: 90×45 C-section (span 2100mm), 140×45 C-section (span 3200mm), 150×75 RHS bearer (span 3000mm), 200×75 RHS bearer (span 4000mm). Requires anti-corrosion treatment.
- Timber: H3 treated pine or hardwood. 90×45 (span 1500mm), 140×45 (span 2400mm), 190×45 (span 3200mm). H4 for in-ground.

BOARD LAYOUT RULES:
- Parallel: Boards along length, joists across width. Standard layout.
- Perpendicular: Boards across width, joists along length. May need closer spacing.
- Diagonal (45°): Requires 30% closer joist spacing. 15-20% waste vs 10% standard.
- Picture Frame: Perimeter border boards perpendicular to field. Needs extra joist/nogging at perimeter.
- Breaker Board: Perpendicular board at stagger joints/midspan. Needs double joist at position.
- Expansion: Composite 3mm/m length, 0.5mm/m width. Never butt tight.

WALL PLATE (LEDGER) FOR WALL-MOUNTED DECKS:
- M12 coach bolts at 600mm centres into masonry, or coach screws into timber frame.
- Z-flashing above wall plate to prevent moisture ingress.
- Min bolt embedment: 75mm masonry, 90mm timber.
- 10mm packers between wall plate and wall for drainage air gap.

DESIGN CERTIFICATES:
- Available for: Flat, Flat Fly-Over, Flat Freestanding, Gable, Gable Fly-Over, Flat-Gable-Flat
- Input: Wind region, terrain category, shielding, topography → Wind classification (N1-C3)
- Output: Beam capacity check, footing dimensions (B×D), slab L minimum, rafter strengthening requirements

FASTENERS:
- Roof to gutter: 14g 14x20 hex teks, 1 per crest
- Roof to gutter clip: 1.2mm galv steel, max 1000mm spacing
- Backchannel: 5mm bolts at max 500mm centres
- Rafter stiffener: 75x3.15mm nails @ 200mm cts OR 75mm No.14 Type 17 tek @ 400mm cts
- Versiclad: 14g screws, every crest, 3 per SIRP, Class 4 corrosion resistance

BRACKETRY COLOURS: Primrose, Pearl White, Paperbark (E-coat & powdercoat on Zincanneal)

SAFETY:
- No pedestrian access on roof sheets (except Climatek). Walkway required per AS1562.1.
- Builder must confirm top plate hold down before extenda bracket installation.
- All structures comply with Building Code of Australia and relevant AS standards.

BRICKWORK ANCHORS:
- Burnt clay masonry 110mm thick, dead load 2.1kN/m²
- Effective area: 45° zone from base of fixing to top of wall, excluding openings
- Max capacity = area × 1.9 kN
- Post fixed to brickwork at top, bottom, and mid height

RB102 - CYCLONIC AREAS (C1-C4):
- Same beam/panel specs as RB100 but with cyclone washers on ALL cladding screws from C2 onwards
- Slendek: 12-14x35mm Tek screws pan fixed with 25mm bonded washer + cyclone washers
- Sheet side laps: 3.2x9.4 steel rivets at 900mm centres
- Wind pressures: C1=1.01kPa, C2=1.50kPa, C3=2.16kPa, C4=2.94kPa

RHS STEEL BEAMS (Alternative to Roll Formed):
- Available sizes: 75x50x2.5, 100x50x3, 150x50x3, 150x50x4, 150x100x4, 200x100x4
- Connections: Fully welded joints OR bolted with 3mm MS plate & min 2xM10 bolts
- Backchannel: 1.2 G550 or 1.0 G300
- Max moment capacities (kNm): 100x50x3=8, 150x50x3=15, 150x50x4=19, 150x100x4=30, 200x100x4=45, 200x100x5=55

ALUMINIUM BOX BEAMS:
- Sizes: 100x50x1.6, 100x50x3.0, 150x50x3.0, 200x50x3.0, 250x50x3.0
- Max overhang: 600mm, max 25% of span
- Span reductions by Cp'n: 5% for 1.0, 10% for 1.1, 15% for 1.2, 20% for 1.6
- Example spans (100x50x1.6, Cp'n 0.7): N1=4500mm@1500proj, N2=4000mm, N3/C1=3900mm, N4/C2=3300mm

AB104 ALUMINIUM BEAMS:
- Structural aluminium beams for patio applications
- Available in multiple sizes with specific span tables per wind class

POINT LOAD BEAMS:
- Concentrated load support beams for specific structural requirements
- Used where loads are not uniformly distributed (e.g., supporting posts from above)

SLAB DESIGN (Concrete):
- 100mm thick, 20MPa concrete, 25mm cover
- Fabric: SL72 (slab <18m), SL82 (18-25m)
- Internal beam spacing: 5000mm max, corners 4000mm max
- Dowels: N16 x 400mm long into existing footing at 600mm centres, 150mm min embedment
- Piers: 300Ø if required, extend 0.2m into firm natural ground, max 2.0m centres
- On 0.2mm polythene membrane with sand/granular bedding

FSS02 - FREE STANDING GABLE:
- Truss spacing tables for 140x50, 150x60, 200x60 beams
- Post capacities: 75x75x2=23kN, 90x90x2=29kN, 89x89x3.5=38kN, 100x100x3=50kN
- Timber: 90x90 F17 HW = 27.5kN capacity
- Roof to gutter clip: tek drive every 3rd sheet, pop rivet other end, clips every 1m on sides

INSULROOF SPAN DATA (Queensland):
- Insulated roofing panel spans for QLD wind regions
- Specific to tropical/subtropical conditions

CORROLINK-S SPAN DATA (NSW):
- Corrolink-S panel spans for NSW wind regions
- Corrugated profile insulated panel

SOLAR PANELS ON EZI-STRUCT/VERSICLAD:
- Certified for non-cyclonic N1, N2, N3 only
- Panels parallel to roof, slope <30°, gap 50-300mm
- Min 1200mm from roof edge (exclusion zones)
- Max panel weight: 0.15kN/m² (15kg/m²)
- Connection via L-foot brackets with GESIPA rivets to SIRP crest
- Valid until 30 April 2026

SPANLITES & DIFFUSERS (New Product):
- Universal compatibility: works with Double-U single skin AND entire Ezistruct insulated panel range
- Diffuser has prismatic internal layer creating 3x more light than competitors
- Available: Opal, Clear. Stock lengths: 4m, 5m, 6m, 7m
- Spanlite: 111mm profile, 168mm total. Diffuser: 130mm profile, 150mm total
- Installation with IRP: order sheets with "Insulation blanks for Spanlite & Diffuser" option

BRACKETRY CATALOGUE (Complete Part Numbers):
- Truss Top Connectors: SPATTC140 (113.5mm), SPATTC200 (126mm) — 1.5mm Zincanneal
- Truss End Cap Channels: SPATECC150 (51mm internal), SPATECC160 (64mm) — 1200mm lengths
- Beam End Caps: SPABEC series for 140/150/200 beams (full wrap, half height, extended, double, pairs, 45°)
- Rafter Brackets: SPARBE2550 (150x50mm), SPARBE22.565 (220x65mm), SPARBUS (short 245mm), SPARBUL (long 350mm)
- Fascia Brackets: SPAFBS/SPAFBSS (single), SPAFBD/SPAFBDS (double) — add R/L suffix for handed
- Steel Internal Post Connectors: SPAPCS150/165/175/190 — G250 2.9mm Galvabond, E-coat Black
- Beam to Post Connectors: SPABPC140/150/200 — 3mm extruded aluminium, V-groove 90°
- Structural Gutter Bracket: SPASGB — 115x50mm, G250 2.9mm Galvabond

BUILDING & ASSEMBLY METHODS (MAN-2012, Updated Feb 2025):
- Comprehensive construction manual covering all structure types
- Step-by-step assembly procedures for flat, gable, and combination structures
- Detailed connection methods, flashing installation, and weatherproofing
- Safety requirements and compliance with Australian Standards

WIND CLASSIFICATIONS: Non-cyclonic N1-N4, Cyclonic C1-C4
SOIL CLASSES: A, S, M (reactive clay), H, E (each affects footing design)
`.trim();
