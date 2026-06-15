/**
 * Branded email HTML template for internal system notifications.
 * Uses company logo, address, and styling instead of Manus branding.
 */
import { ENV } from "../_core/env";

interface BrandedEmailOptions {
  subject: string;
  heading: string;
  body: string; // HTML content for the main body
  footerNote?: string; // Optional additional footer text
}

const LOGO_URL = process.env.VITE_APP_LOGO || "";
const BRAND_COLOR = "#1B2B3A"; // Dark navy from the app theme
const ACCENT_COLOR = "#C9AB57"; // Gold accent

/**
 * Wraps email content in a branded HTML template with company logo,
 * consistent styling, and company footer with address/licences.
 */
export function buildBrandedEmail(options: BrandedEmailOptions): string {
  const { heading, body, footerNote } = options;
  const companyName = ENV.emailSenderName || "Altaspan";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header with Logo -->
          <tr>
            <td style="background-color: ${BRAND_COLOR}; padding: 24px 32px; text-align: center;">
              ${LOGO_URL
                ? `<img src="${LOGO_URL}" alt="${companyName}" style="height: 48px; width: auto; max-width: 220px; object-fit: contain;" />`
                : `<h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">${companyName}</h1>`
              }
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 20px; color: ${BRAND_COLOR}; font-size: 20px; font-weight: 600; border-bottom: 2px solid ${ACCENT_COLOR}; padding-bottom: 12px;">
                ${heading}
              </h2>
              <div style="color: #374151; font-size: 15px; line-height: 1.7;">
                ${body}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              ${footerNote ? `<p style="margin: 0 0 12px; color: #6b7280; font-size: 13px; line-height: 1.5;">${footerNote}</p>` : ""}
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                Spanline Home Additions ACT and RIV<br />
                10 Brookes Street, Mitchell ACT 2911<br />
                Ph: 02 6241 6999 | ABN: 44 658 951 207<br />
                ACT Licence: 2023575 | NSW Licence: 395557C
              </p>
              <p style="margin: 8px 0 0; color: #d1d5db; font-size: 11px;">
                &copy; ${new Date().getFullYear()} Commisso Group Pty Limited. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
