/**
 * Re-export deck proposal adapter from shared module.
 * The actual logic lives in shared/deckProposalAdapter.ts so it can be
 * imported from both client code and server-side Vitest tests.
 */
export {
  validateDeckQuoteForProposal,
  adaptDeckQuoteToProposal,
  buildDeckDescription,
  type DeckQuoteFormData,
  type DeckProposalValidation,
  type ProposalQuoteDataShape,
} from "../../../shared/deckProposalAdapter";
