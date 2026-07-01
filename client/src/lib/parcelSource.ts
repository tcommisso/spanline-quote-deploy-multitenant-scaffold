export function parcelSourceLabel(source?: string | null) {
  switch (source) {
    case "actmapi":
      return "ACTmapi";
    case "nsw_cadastre":
      return "NSW Cadastre";
    case "qld_cadastre":
      return "QLD DCDB Cadastre";
    case "vic_cadastre":
      return "VIC VicPlan Cadastre";
    default:
      return "Cadastre";
  }
}
