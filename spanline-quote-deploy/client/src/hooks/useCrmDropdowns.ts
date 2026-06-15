import { trpc } from "@/lib/trpc";

/**
 * Hook to fetch CRM dropdown options by category.
 * Returns the options array (active only) and loading state.
 * Falls back to empty array while loading.
 */
export function useCrmDropdowns(category: string) {
  const { data, isLoading } = trpc.crmDropdowns.list.useQuery(
    { category, activeOnly: true },
    { staleTime: 5 * 60 * 1000 } // Cache for 5 minutes
  );
  return { options: data || [], isLoading };
}

/**
 * Get status options as { value, label } pairs.
 */
export function useLeadStatusOptions() {
  const { options, isLoading } = useCrmDropdowns("lead_status");
  return {
    statusOptions: options.map(o => ({ value: o.value, label: o.label })),
    isLoading,
  };
}

/**
 * Get product type options as string[].
 */
export function useProductTypeOptions() {
  const { options, isLoading } = useCrmDropdowns("product_type");
  return {
    productTypes: options.map(o => o.value),
    isLoading,
  };
}

/**
 * Get lead source options as string[].
 */
export function useLeadSourceOptions() {
  const { options, isLoading } = useCrmDropdowns("lead_source");
  return {
    leadSources: options.map(o => o.value),
    isLoading,
  };
}

/**
 * Get outcome options as string[].
 */
export function useOutcomeOptions() {
  const { options, isLoading } = useCrmDropdowns("outcome");
  return {
    outcomes: options.map(o => o.value),
    isLoading,
  };
}

/**
 * Get appointment type options as { value, label } pairs.
 */
export function useAppointmentTypeOptions() {
  const { options, isLoading } = useCrmDropdowns("appointment");
  return {
    appointmentTypes: options.map(o => ({ value: o.value, label: o.label })),
    isLoading,
  };
}

/**
 * Get building authority status options as { value, label } pairs.
 */
export function useBuildingAuthorityOptions() {
  const { options, isLoading } = useCrmDropdowns("building_authority");
  return {
    buildingAuthorityStatuses: options.map(o => ({ value: o.value, label: o.label })),
    isLoading,
  };
}

/**
 * Get council letter type options as { value, label } pairs.
 */
export function useCouncilLetterTypeOptions() {
  const { options, isLoading } = useCrmDropdowns("council_letter_type");
  return {
    councilLetterTypes: options.map(o => ({ value: o.value, label: o.label })),
    isLoading,
  };
}
