/**
 * Legacy Forge Data API helper.
 * Production integrations should use direct provider clients instead.
 */
export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

export async function callDataApi(
  apiId: string,
  options: DataApiCallOptions = {}
): Promise<unknown> {
  void apiId;
  void options;
  throw new Error("Legacy Forge Data API is disabled. Use a direct provider integration instead.");
}
