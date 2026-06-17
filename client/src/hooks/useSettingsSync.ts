/**
 * useSettingsSync — syncs proposal/branding settings with the server
 * so they persist across devices instead of being device-specific.
 *
 * On mount: fetches server settings and applies to localStorage.
 * On save: writes to both localStorage and server.
 */
import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  loadCompanyDetails,
  saveCompanyDetails,
  loadProposalText,
  saveProposalText,
  loadAppIcon,
  saveAppIcon,
  clearAppIcon,
  loadFavicon,
  saveFavicon,
  clearFavicon,
  loadCustomLogo,
  saveCustomLogo,
  clearCustomLogo,
  type CompanyDetails,
  type ProposalText,
  type AppIcon,
  type Favicon,
  type CustomLogo,
} from "@/lib/proposalStore";

export function useSettingsSync() {
  const { data: serverSettings, isSuccess } = trpc.userSettings.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const saveMutation = trpc.userSettings.save.useMutation();
  const hasApplied = useRef(false);

  // Apply server settings on first load
  useEffect(() => {
    if (!isSuccess || !serverSettings || hasApplied.current) return;
    hasApplied.current = true;

    // Sync company details
    if (serverSettings.companyDetails) {
      saveCompanyDetails(serverSettings.companyDetails as CompanyDetails);
    }

    // Sync proposal text
    if (serverSettings.proposalText) {
      saveProposalText(serverSettings.proposalText as ProposalText);
    }

    // Sync app icon URL — if server has one, apply it
    if (serverSettings.appIconUrl) {
      const currentIcon = loadAppIcon();
      if (!currentIcon || currentIcon.dataUrl !== serverSettings.appIconUrl) {
        saveAppIcon({
          dataUrl: serverSettings.appIconUrl,
          fileName: "synced-icon",
          width: 64,
          height: 64,
        });
      }
    }

    // Sync custom logo URL
    if (serverSettings.customLogoUrl) {
      const currentLogo = loadCustomLogo();
      if (!currentLogo || currentLogo.dataUrl !== serverSettings.customLogoUrl) {
        saveCustomLogo({
          dataUrl: serverSettings.customLogoUrl,
          fileName: "synced-logo",
          width: 200,
          height: 60,
        });
      }
    }

    // Sync favicon URL
    if ((serverSettings as any).faviconUrl) {
      const currentFavicon = loadFavicon();
      if (!currentFavicon || currentFavicon.dataUrl !== (serverSettings as any).faviconUrl) {
        saveFavicon({
          dataUrl: (serverSettings as any).faviconUrl,
          fileName: "synced-favicon",
          width: 32,
          height: 32,
        });
      }
    }
  }, [isSuccess, serverSettings]);

  // Save company details to server
  const syncCompanyDetails = useCallback((details: CompanyDetails) => {
    saveCompanyDetails(details);
    saveMutation.mutate({ companyDetails: details });
  }, [saveMutation]);

  // Save proposal text to server
  const syncProposalText = useCallback((text: ProposalText) => {
    saveProposalText(text);
    saveMutation.mutate({ proposalText: text });
  }, [saveMutation]);

  // Save app icon to server (stores the dataUrl)
  const syncAppIcon = useCallback((icon: AppIcon | null) => {
    if (icon) {
      saveAppIcon(icon);
      saveMutation.mutate({ appIconUrl: icon.dataUrl });
    } else {
      clearAppIcon();
      saveMutation.mutate({ appIconUrl: null });
    }
  }, [saveMutation]);

  // Save favicon to server
  const syncFavicon = useCallback((icon: Favicon | null) => {
    if (icon) {
      saveFavicon(icon);
      saveMutation.mutate({ faviconUrl: icon.dataUrl });
    } else {
      clearFavicon();
      saveMutation.mutate({ faviconUrl: null });
    }
  }, [saveMutation]);

  // Save custom logo to server
  const syncCustomLogo = useCallback((logo: CustomLogo | null) => {
    if (logo) {
      saveCustomLogo(logo);
      saveMutation.mutate({ customLogoUrl: logo.dataUrl });
    } else {
      clearCustomLogo();
      saveMutation.mutate({ customLogoUrl: null });
    }
  }, [saveMutation]);

  return {
    syncCompanyDetails,
    syncProposalText,
    syncAppIcon,
    syncFavicon,
    syncCustomLogo,
    isLoaded: hasApplied.current || isSuccess,
    serverSettings,
  };
}
