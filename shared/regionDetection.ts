/**
 * Region Detection Utility
 * Maps Australian postcodes and suburbs to Spanline pricing regions.
 *
 * Regions: Canberra (base), Queanbeyan (1.05×), Yass (1.05×),
 *          Goulburn (1.05×), ACT (1.10×), South Coast (1.15×), Riverina (1.00×)
 */

export type SpanlineRegion =
  | "Canberra"
  | "Queanbeyan"
  | "Yass"
  | "Goulburn"
  | "ACT"
  | "South Coast"
  | "Riverina";

/**
 * Postcode ranges for each region.
 * These are approximate and cover the main service areas.
 */
const POSTCODE_RANGES: { region: SpanlineRegion; ranges: [number, number][] }[] = [
  // Canberra CBD and inner suburbs
  {
    region: "Canberra",
    ranges: [
      [2600, 2612], // Canberra CBD, Barton, Deakin, Yarralumla, Woden, etc.
      [2614, 2614], // Weston Creek
      [2615, 2615], // Belconnen
      [2617, 2617], // Belconnen / Bruce
      [2900, 2906], // Tuggeranong
    ],
  },
  // ACT (broader ACT areas not in Canberra core)
  {
    region: "ACT",
    ranges: [
      [2601, 2601], // Civic
      [2613, 2613], // Hall, Murrumbateman (ACT side)
      [2616, 2616], // Mitchell
      [2618, 2618], // Hall
      [2620, 2620], // Shared with Queanbeyan — handled by suburb check
      [2900, 2920], // Broader Tuggeranong / Gungahlin
    ],
  },
  // Queanbeyan and surrounds
  {
    region: "Queanbeyan",
    ranges: [
      [2620, 2620], // Queanbeyan (primary)
      [2621, 2621], // Bungendore
      [2622, 2623], // Captains Flat, Braidwood area
    ],
  },
  // Yass and surrounds
  {
    region: "Yass",
    ranges: [
      [2582, 2582], // Yass
      [2583, 2584], // Murrumbateman, Gunning
      [2580, 2580], // Goulburn (shared — use suburb check)
    ],
  },
  // Goulburn and surrounds
  {
    region: "Goulburn",
    ranges: [
      [2580, 2580], // Goulburn
      [2581, 2581], // Gunning / Crookwell area
      [2579, 2579], // Marulan
      [2577, 2578], // Moss Vale / Bundanoon (fringe)
    ],
  },
  // South Coast
  {
    region: "South Coast",
    ranges: [
      [2535, 2541], // Nowra, Shoalhaven, Jervis Bay
      [2536, 2536], // Batemans Bay
      [2537, 2537], // Moruya
      [2538, 2538], // Ulladulla
      [2539, 2539], // Milton
      [2540, 2540], // Jervis Bay
      [2545, 2551], // Narooma, Bermagui, Bega, Merimbula, Eden
      [2546, 2546], // Narooma
      [2548, 2548], // Merimbula
      [2549, 2549], // Eden
      [2550, 2550], // Bega
    ],
  },
  // Riverina
  {
    region: "Riverina",
    ranges: [
      [2650, 2650], // Wagga Wagga
      [2640, 2640], // Albury
      [2641, 2641], // Lavington
      [2642, 2660], // Broader Riverina (Tumut, Tumbarumba, etc.)
      [2680, 2680], // Griffith
      [2700, 2700], // Narrandera
      [2710, 2710], // Deniliquin
      [2720, 2720], // Tumut
    ],
  },
];

/**
 * Known suburb → region mappings for disambiguation
 * (when postcodes overlap between regions)
 */
const SUBURB_OVERRIDES: Record<string, SpanlineRegion> = {
  // Canberra core suburbs
  "canberra": "Canberra",
  "barton": "Canberra",
  "yarralumla": "Canberra",
  "deakin": "Canberra",
  "woden": "Canberra",
  "weston creek": "Canberra",
  "belconnen": "Canberra",
  "gungahlin": "Canberra",
  "tuggeranong": "Canberra",
  "fyshwick": "Canberra",
  "kingston": "Canberra",
  "manuka": "Canberra",
  "griffith": "Canberra",
  "red hill": "Canberra",
  "narrabundah": "Canberra",
  "forrest": "Canberra",
  "curtin": "Canberra",
  "garran": "Canberra",
  "hughes": "Canberra",
  "lyons": "Canberra",
  "phillip": "Canberra",
  "wanniassa": "Canberra",
  "kambah": "Canberra",
  "isabella plains": "Canberra",
  "calwell": "Canberra",
  "gordon": "Canberra",
  "conder": "Canberra",
  "banks": "Canberra",
  "bonython": "Canberra",
  "greenway": "Canberra",
  "oxley": "Canberra",
  "richardson": "Canberra",
  "chisholm": "Canberra",
  "fadden": "Canberra",
  "macarthur": "Canberra",
  "monash": "Canberra",
  "theodore": "Canberra",
  "gilmore": "Canberra",
  "bruce": "Canberra",
  "cook": "Canberra",
  "macquarie": "Canberra",
  "aranda": "Canberra",
  "hawker": "Canberra",
  "scullin": "Canberra",
  "page": "Canberra",
  "florey": "Canberra",
  "latham": "Canberra",
  "higgins": "Canberra",
  "holt": "Canberra",
  "rivett": "Canberra",
  "stirling": "Canberra",
  "waramanga": "Canberra",
  "fisher": "Canberra",
  "chapman": "Canberra",
  "duffy": "Canberra",
  "holder": "Canberra",
  "weston": "Canberra",
  "ngunnawal": "Canberra",
  "casey": "Canberra",
  "franklin": "Canberra",
  "harrison": "Canberra",
  "forde": "Canberra",
  "bonner": "Canberra",
  "amaroo": "Canberra",
  "palmerston": "Canberra",
  "mitchell": "Canberra",
  "civic": "Canberra",

  // Queanbeyan
  "queanbeyan": "Queanbeyan",
  "queanbeyan east": "Queanbeyan",
  "queanbeyan west": "Queanbeyan",
  "karabar": "Queanbeyan",
  "jerrabomberra": "Queanbeyan",
  "googong": "Queanbeyan",
  "bungendore": "Queanbeyan",
  "captains flat": "Queanbeyan",

  // Yass
  "yass": "Yass",
  "murrumbateman": "Yass",
  "gunning": "Yass",
  "bowning": "Yass",

  // Goulburn
  "goulburn": "Goulburn",
  "marulan": "Goulburn",
  "crookwell": "Goulburn",
  "tarago": "Goulburn",

  // South Coast
  "batemans bay": "South Coast",
  "moruya": "South Coast",
  "narooma": "South Coast",
  "ulladulla": "South Coast",
  "nowra": "South Coast",
  "berry": "South Coast",
  "kiama": "South Coast",
  "merimbula": "South Coast",
  "bega": "South Coast",
  "eden": "South Coast",
  "milton": "South Coast",
  "jervis bay": "South Coast",
  "vincentia": "South Coast",
  "huskisson": "South Coast",
  "shoalhaven heads": "South Coast",
  "sussex inlet": "South Coast",
  "broulee": "South Coast",
  "malua bay": "South Coast",
  "tomakin": "South Coast",
  "dalmeny": "South Coast",
  "bermagui": "South Coast",
  "tathra": "South Coast",
  "pambula": "South Coast",

  // Riverina
  "wagga wagga": "Riverina",
  "albury": "Riverina",
  "lavington": "Riverina",
  "tumut": "Riverina",
  "griffith nsw": "Riverina",
  "narrandera": "Riverina",
  "deniliquin": "Riverina",
  "leeton": "Riverina",
  "junee": "Riverina",
  "cootamundra": "Riverina",
  "young": "Riverina",
  "temora": "Riverina",
  "west wyalong": "Riverina",
  "hay": "Riverina",
  "corowa": "Riverina",
  "wodonga": "Riverina",
};

/**
 * Detect the Spanline pricing region from a postcode and/or suburb.
 * Returns the detected region or null if no match is found.
 *
 * Priority: suburb override > postcode range lookup
 */
export function detectRegion(
  postcode?: string | null,
  suburb?: string | null,
  state?: string | null
): SpanlineRegion | null {
  // 1. Try suburb override first (most specific)
  if (suburb) {
    const normalised = suburb.toLowerCase().trim();
    if (SUBURB_OVERRIDES[normalised]) {
      return SUBURB_OVERRIDES[normalised];
    }
  }

  // 2. If state is ACT and no specific suburb match, default to ACT region
  if (state && state.toUpperCase() === "ACT") {
    // Check if it's a Canberra-core postcode
    const pc = postcode ? parseInt(postcode, 10) : 0;
    if (pc >= 2600 && pc <= 2618) {
      return "Canberra";
    }
    if (pc >= 2900 && pc <= 2906) {
      return "Canberra";
    }
    return "ACT";
  }

  // 3. Try postcode range lookup
  if (postcode) {
    const pc = parseInt(postcode, 10);
    if (!isNaN(pc)) {
      // Check specific regions in priority order (most specific first)
      // Queanbeyan
      if (pc === 2620 || pc === 2621) return "Queanbeyan";
      // Goulburn
      if (pc === 2580 || pc === 2579 || pc === 2581) return "Goulburn";
      // Yass
      if (pc >= 2582 && pc <= 2584) return "Yass";
      // South Coast
      if (pc >= 2535 && pc <= 2551) return "South Coast";
      // Riverina
      if (pc === 2650 || pc === 2640 || pc === 2641 || (pc >= 2642 && pc <= 2660) ||
          pc === 2680 || pc === 2700 || pc === 2710 || pc === 2720) return "Riverina";
      // Canberra
      if ((pc >= 2600 && pc <= 2618) || (pc >= 2900 && pc <= 2920)) return "Canberra";
    }
  }

  return null;
}
