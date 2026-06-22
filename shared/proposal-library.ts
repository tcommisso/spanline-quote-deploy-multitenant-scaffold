export const PROPOSAL_LIBRARY_SECTION_TYPES = [
  "all",
  "opq",
  "deck",
  "eclipse",
  "security_screen",
  "blind",
] as const;

export type ProposalLibrarySectionType = typeof PROPOSAL_LIBRARY_SECTION_TYPES[number];

export const PROPOSAL_LIBRARY_SECTION_LABELS: Record<ProposalLibrarySectionType, string> = {
  all: "All Products",
  opq: "Structure",
  deck: "Deck",
  eclipse: "Eclipse",
  security_screen: "Security Screens",
  blind: "Blinds",
};

export const PROPOSAL_LIBRARY_CONTENT_TYPES = [
  "overview",
  "procedure",
  "features",
  "image",
  "spec_highlight",
  "warranty",
  "terms",
  "other",
] as const;

export type ProposalLibraryContentType = typeof PROPOSAL_LIBRARY_CONTENT_TYPES[number];

export const PROPOSAL_LIBRARY_CONTENT_LABELS: Record<ProposalLibraryContentType, string> = {
  overview: "Overview",
  procedure: "Procedure",
  features: "Features",
  image: "Image",
  spec_highlight: "Specification Highlight",
  warranty: "Warranty",
  terms: "Terms",
  other: "Other",
};

export const PROPOSAL_IMAGE_MAX_EDGE = 1800;
export const PROPOSAL_IMAGE_MIN_LONG_EDGE = 1200;
export const PROPOSAL_IMAGE_MIN_SHORT_EDGE = 700;
