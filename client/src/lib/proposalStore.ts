/**
 * Proposal Settings Store
 * Persists branded PDF proposal customisation in localStorage.
 * Follows the product-quoting-app skill store pattern.
 */

// ─── Company Details ─────────────────────────────────────────────────────────
export interface CompanyDetails {
  companyName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  licenceACT: string;
  licenceNSW: string;
  abn: string;
}

const COMPANY_KEY = "spanline_company_details_v1";

export function loadCompanyDetails(): CompanyDetails {
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    return raw ? JSON.parse(raw) : getDefaultCompanyDetails();
  } catch {
    return getDefaultCompanyDetails();
  }
}

export function saveCompanyDetails(details: CompanyDetails): void {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(details));
}

export function getDefaultCompanyDetails(): CompanyDetails {
  return {
    companyName: "Commisso Group Pty Limited",
    phone: "",
    email: "",
    website: "",
    address: "",
    licenceACT: "2023575",
    licenceNSW: "395557C",
    abn: "",
  };
}

// ─── Custom Logo ─────────────────────────────────────────────────────────────
export interface CustomLogo {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

const LOGO_KEY = "spanline_custom_logo_v1";

export function loadCustomLogo(): CustomLogo | null {
  try {
    const raw = localStorage.getItem(LOGO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCustomLogo(logo: CustomLogo): void {
  localStorage.setItem(LOGO_KEY, JSON.stringify(logo));
}

export function clearCustomLogo(): void {
  localStorage.removeItem(LOGO_KEY);
}

export async function fileToCustomLogo(file: File): Promise<CustomLogo> {
  if (file.size > 2 * 1024 * 1024) throw new Error("File too large (max 2MB)");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () =>
        resolve({
          dataUrl: reader.result as string,
          fileName: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Proposal Text ───────────────────────────────────────────────────────────
export interface ProposalText {
  introTitle: string;
  introBody: string;
  scopeTitle: string;
  scopeBody: string;
  warrantyTitle: string;
  warrantyBody: string;
  footerNote: string;
}

const PROPOSAL_TEXT_KEY = "spanline_proposal_text_v1";

export function loadProposalText(): ProposalText {
  try {
    const raw = localStorage.getItem(PROPOSAL_TEXT_KEY);
    return raw ? JSON.parse(raw) : getDefaultProposalText();
  } catch {
    return getDefaultProposalText();
  }
}

export function saveProposalText(text: ProposalText): void {
  localStorage.setItem(PROPOSAL_TEXT_KEY, JSON.stringify(text));
}

export function getDefaultProposalText(): ProposalText {
  return {
    introTitle: "Your Outdoor Living Proposal",
    introBody:
      "Thank you for the opportunity to provide this proposal for your outdoor living project. We are pleased to present the following solution tailored to your requirements.",
    scopeTitle: "Scope of Works",
    scopeBody:
      "The following works are included in this proposal as detailed in the project specification sheet. All construction will be in accordance with relevant Australian Standards and Building Codes.",
    warrantyTitle: "Warranty & Guarantee",
    warrantyBody:
      "All structural components carry a 15-year warranty. Powder coat finishes are warranted for 10 years against peeling, flaking, and excessive fading under normal conditions.",
    footerNote:
      "This proposal is valid for 30 days from the date of issue. Prices are subject to change after this period.",
  };
}

// ─── Terms Document ──────────────────────────────────────────────────────────
export interface TermsDocument {
  dataUrl: string;
  fileName: string;
  pageCount: number;
}

const TERMS_KEY = "spanline_terms_doc_v1";

export function loadTermsDocument(): TermsDocument | null {
  try {
    const raw = localStorage.getItem(TERMS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTermsDocument(doc: TermsDocument): void {
  localStorage.setItem(TERMS_KEY, JSON.stringify(doc));
}

export function clearTermsDocument(): void {
  localStorage.removeItem(TERMS_KEY);
}

export async function fileToTermsDocument(file: File): Promise<TermsDocument> {
  if (file.type !== "application/pdf") throw new Error("Only PDF files accepted");
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5MB)");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const pageCount = Math.max(1, Math.round(file.size / 50000));
      resolve({ dataUrl: reader.result as string, fileName: file.name, pageCount });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── App Logo (Square logo for sidebar/login) ──────────────────────────────
export interface AppIcon {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

const APP_ICON_KEY = "spanline_app_icon_v1";

export function loadAppIcon(): AppIcon | null {
  try {
    const raw = localStorage.getItem(APP_ICON_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAppIcon(icon: AppIcon): void {
  localStorage.setItem(APP_ICON_KEY, JSON.stringify(icon));
  // Also store the URL separately for quick access in DashboardLayout
  localStorage.setItem("app_icon_url", icon.dataUrl);
  // Notify same-tab listeners (e.g. favicon hook)
  window.dispatchEvent(new Event("app-icon-changed"));
}

export function clearAppIcon(): void {
  localStorage.removeItem(APP_ICON_KEY);
  localStorage.removeItem("app_icon_url");
  // Notify same-tab listeners (e.g. favicon hook)
  window.dispatchEvent(new Event("app-icon-changed"));
}

export async function fileToAppIcon(file: File): Promise<AppIcon> {
  if (file.size > 1 * 1024 * 1024) throw new Error("File too large (max 1MB)");
  if (!file.type.startsWith("image/")) throw new Error("Only image files accepted");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl: reader.result as string,
          fileName: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Favicon (Separate from App Logo, used for browser tab icon) ────────────
export interface Favicon {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

const FAVICON_KEY = "spanline_favicon_v1";

export function loadFavicon(): Favicon | null {
  try {
    const raw = localStorage.getItem(FAVICON_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFavicon(icon: Favicon): void {
  localStorage.setItem(FAVICON_KEY, JSON.stringify(icon));
  window.dispatchEvent(new Event("favicon-changed"));
}

export function clearFavicon(): void {
  localStorage.removeItem(FAVICON_KEY);
  window.dispatchEvent(new Event("favicon-changed"));
}

export async function fileToFavicon(file: File): Promise<Favicon> {
  if (file.size > 1 * 1024 * 1024) throw new Error("File too large (max 1MB)");
  if (!file.type.startsWith("image/")) throw new Error("Only image files accepted");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl: reader.result as string,
          fileName: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Settings Bundle (Export/Import) ─────────────────────────────────────────
export interface SettingsBundle {
  version: string;
  exportedAt: string;
  companyDetails: CompanyDetails;
  customLogo: CustomLogo | null;
  appIcon: AppIcon | null;
  proposalText: ProposalText;
  termsDocument: TermsDocument | null;
}

export function createSettingsBundle(): SettingsBundle {
  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    companyDetails: loadCompanyDetails(),
    customLogo: loadCustomLogo(),
    appIcon: loadAppIcon(),
    proposalText: loadProposalText(),
    termsDocument: loadTermsDocument(),
  };
}

export function restoreSettingsBundle(bundle: SettingsBundle): void {
  saveCompanyDetails(bundle.companyDetails);
  saveProposalText(bundle.proposalText);
  if (bundle.customLogo) saveCustomLogo(bundle.customLogo);
  else clearCustomLogo();
  if (bundle.appIcon) saveAppIcon(bundle.appIcon);
  else clearAppIcon();
  if (bundle.termsDocument) saveTermsDocument(bundle.termsDocument);
  else clearTermsDocument();
}
