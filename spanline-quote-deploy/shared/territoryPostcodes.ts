/**
 * Territory-to-Branch postcode mapping for auto-allocation of leads.
 * Each territory maps to a branch ID and a list of postcodes.
 * When a lead comes in with a postcode matching a territory, it is
 * automatically assigned to the corresponding branch.
 *
 * Note: Some postcodes appear in multiple territories (e.g. 2586, 2642, 2720).
 * In case of overlap, the FIRST matching territory in the array wins.
 * ACT is listed first as the primary branch.
 */

export interface TerritoryMapping {
  territory: string;
  branchId: number;
  postcodes: string[];
}

export const TERRITORY_POSTCODES: TerritoryMapping[] = [
  {
    territory: "ACT",
    branchId: 1, // Canberra
    postcodes: [
      "200", "221",
      "2580", "2581", "2582", "2583", "2586",
      "2600", "2601", "2602", "2603", "2604", "2605", "2606", "2607", "2608", "2609",
      "2610", "2611", "2612", "2614", "2615", "2616", "2617", "2618", "2619",
      "2620", "2621", "2622", "2623", "2624", "2625", "2626", "2627", "2628", "2629",
      "2630", "2633", "2642", "2720",
      "2900", "2901", "2902", "2903", "2904", "2905", "2906",
      "2911", "2912", "2913", "2914",
    ],
  },
  {
    territory: "Riverina",
    branchId: 2, // Wagga Wagga
    postcodes: [
      "2584", "2585", "2586", "2587", "2588", "2590", "2594",
      "2642", "2645", "2649", "2650", "2651", "2652", "2653", "2655", "2656", "2658",
      "2661", "2663", "2665", "2666", "2668", "2669", "2671", "2675", "2678",
      "2680", "2681",
      "2700", "2701", "2702", "2703", "2705", "2706", "2707",
      "2710", "2711", "2716",
      "2720", "2721", "2722", "2725", "2726", "2727", "2729", "2730",
      "2794", "2803", "2807", "2809", "2810",
    ],
  },
  {
    territory: "Southern Holiday Coast",
    branchId: 30001, // Southern Holiday Coast
    postcodes: [
      "2536", "2537", "2545", "2546", "2548", "2549", "2550", "2551",
      "2631", "2632",
    ],
  },
];

/**
 * Look up the branch ID for a given postcode.
 * Returns the branchId of the first matching territory, or null if no match.
 */
export function getBranchIdForPostcode(postcode: string | undefined | null): number | null {
  if (!postcode) return null;
  const cleaned = postcode.trim();
  for (const territory of TERRITORY_POSTCODES) {
    if (territory.postcodes.includes(cleaned)) {
      return territory.branchId;
    }
  }
  return null;
}

/**
 * Get the territory name for a given postcode.
 */
export function getTerritoryForPostcode(postcode: string | undefined | null): string | null {
  if (!postcode) return null;
  const cleaned = postcode.trim();
  for (const territory of TERRITORY_POSTCODES) {
    if (territory.postcodes.includes(cleaned)) {
      return territory.territory;
    }
  }
  return null;
}
