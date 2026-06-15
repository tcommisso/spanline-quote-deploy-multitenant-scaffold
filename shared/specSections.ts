/**
 * Shared section metadata for SpecSheet.
 * Used by both the SpecSheet component and the admin Section Templates page.
 */
export const SPEC_SECTIONS = [
  { id: "client", label: "Client & Job Info", category: "general" },
  { id: "dimensions", label: "Dimensions & Structure", category: "structure" },
  { id: "brackets", label: "Attachment & Brackets", category: "structure" },
  { id: "posts", label: "Posts", category: "structure" },
  { id: "gutter", label: "Gutter & Downpipe", category: "exterior" },
  { id: "walls", label: "Walls", category: "exterior" },
  { id: "beams", label: "Beams, Channels & Flashings", category: "structure" },
  { id: "roof", label: "Roof", category: "exterior" },
  { id: "windows", label: "Windows & Doors", category: "exterior" },
  { id: "floor", label: "Internal Floor", category: "interior" },
  { id: "stairs", label: "Stairs", category: "interior" },
  { id: "balustrade", label: "Balustrade", category: "interior" },
  { id: "electrical", label: "Electrical", category: "services" },
  { id: "concreting", label: "Concreting", category: "structure" },
  { id: "demolition", label: "Demolition Works", category: "general" },
  { id: "existingHouse", label: "Work on Existing House", category: "general" },
  { id: "plumbing", label: "Plumbing & Drainage", category: "services" },
  { id: "adjustments", label: "Adjustments", category: "general" },
  { id: "additionalCosts", label: "Checklist Pricing", category: "general" },
  { id: "sitePlan", label: "Site Plan & Elevations", category: "structure" },
  { id: "history", label: "Revision History", category: "general" },
] as const;

export type SpecSectionId = (typeof SPEC_SECTIONS)[number]["id"];

export const SPEC_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "structure", label: "Structure" },
  { id: "exterior", label: "Exterior" },
  { id: "interior", label: "Interior" },
  { id: "services", label: "Services" },
] as const;
