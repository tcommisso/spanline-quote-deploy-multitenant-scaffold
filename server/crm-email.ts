import { sendNotificationEmail, type EmailAttachment } from "./email";

export interface SendCrmLetterParams {
  tenantId?: number | null;
  leadId: number;
  letterType: "unassigned_intro" | "assigned_intro" | "welcome_letter" | "council_intro" | "council_out_of" | "council_no_council";
  to: string;
  clientName: string;
  subject?: string;
  body?: string;
  designAdvisor?: string;
  siteAddress?: string;
  productType?: string;
  quoteNumber?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  branchEmail?: string;
}

const LETTER_TEMPLATES: Record<string, { subject: string; body: string }> = {
  unassigned_intro: {
    subject: "Your Enquiry - Altaspan",
    body: `Thank you for your recent enquiry regarding a home addition.

Altaspan is a national company specialising in outdoor living products including patios, carports, decks, and opening roofs. We have been enhancing Australian homes for over 30 years.

Your enquiry has been received and we will be in touch shortly to discuss your requirements and arrange a convenient time for a no-obligation design consultation at your home.

In the meantime, please feel free to browse our website for inspiration and product information.

Kind regards,
Altaspan`,
  },
  assigned_intro: {
    subject: "Your Design Consultation - Altaspan",
    body: `Thank you for your interest in Altaspan.

We are pleased to advise that a Design Advisor has been assigned to assist you with your outdoor living project. They will be in contact shortly to introduce themselves and arrange a convenient time to visit your home for a complimentary design consultation.

During this consultation, your Design Advisor will discuss your requirements, take measurements, and provide you with a detailed proposal tailored to your home and lifestyle.

We look forward to working with you.

Kind regards,
Altaspan`,
  },
  welcome_letter: {
    subject: "Welcome to Altaspan",
    body: `Thank you for choosing Altaspan for your outdoor living project.

We are delighted to confirm your contract and welcome you as a valued client. Our team is committed to delivering a quality product that will enhance your home for years to come.

Your project will now move into the planning and approvals phase. Your Design Advisor will keep you informed of progress at each stage.

If you have any questions at any time, please don't hesitate to contact us.

Kind regards,
Altaspan`,
  },
  council_intro: {
    subject: "Introduction - Building Application",
    body: `We are writing to introduce ourselves regarding a building application for a residential home addition at the above address.

Altaspan is a national company specialising in outdoor living products including patios, carports, and opening roofs. We have been operating for over 30 years and are committed to quality workmanship and compliance with all relevant building standards.

We will be submitting plans for approval shortly and would appreciate your guidance on any specific requirements for this application.

Please do not hesitate to contact us if you require any additional information.

Kind regards,
Altaspan`,
  },
  council_out_of: {
    subject: "Notification - Exempt Development",
    body: `We are writing to advise that the proposed outdoor living addition at the above address falls within the exempt development provisions of the relevant planning legislation.

As such, no formal development application or building approval is required for this structure. The project will be constructed in accordance with the Building Code of Australia and all relevant Australian Standards.

We are providing this notification as a courtesy and for your records. Should you have any queries, please do not hesitate to contact us.

Kind regards,
Altaspan`,
  },
  council_no_council: {
    subject: "Notification - No Council Approval Required",
    body: `We are writing to confirm that the proposed outdoor living addition at the above address does not require council approval based on the current planning provisions and the nature of the structure.

The project will be constructed in compliance with the Building Code of Australia and all relevant Australian Standards.

This notification is provided for your information and records.

Kind regards,
Altaspan`,
  },
};

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] || match;
  });
}

export async function sendCrmLetter(params: SendCrmLetterParams): Promise<{ success: boolean; error?: string }> {
  const { to, clientName, letterType, subject, body, designAdvisor, siteAddress, productType, quoteNumber } = params;
  const template = LETTER_TEMPLATES[letterType];

  const placeholderVars: Record<string, string> = {
    clientName: clientName || "",
    designAdvisor: designAdvisor || "",
    siteAddress: siteAddress || "",
    productType: productType || "",
    quoteNumber: quoteNumber || "",
    email: to || "",
    branchName: params.branchName || "",
    branchAddress: params.branchAddress || "",
    branchPhone: params.branchPhone || "",
    branchEmail: params.branchEmail || "",
  };

  const rawSubject = subject || template.subject;
  const rawBody = body || template.body;
  const emailSubject = replacePlaceholders(rawSubject, placeholderVars);
  const emailBody = replacePlaceholders(rawBody, placeholderVars);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">Dear ${clientName},</h2>
      <div style="color: #334155; line-height: 1.8; white-space: pre-wrap;">${emailBody}</div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #64748b; font-size: 12px;">This email was sent from Altaspan.</p>
    </div>
  `;

  try {
    const attachments: EmailAttachment[] = [];

    // Attach PDF if configured
    if (params.attachmentUrl) {
      try {
        const response = await fetch(params.attachmentUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          attachments.push({
            filename: params.attachmentName || "attachment.pdf",
            content: buffer.toString("base64"),
            contentType: response.headers.get("content-type") || "application/pdf",
          });
        }
      } catch (attachErr) {
        console.error("[CRM Email] Failed to fetch attachment:", attachErr);
      }
    }

    const result = await sendNotificationEmail({
      tenantId: params.tenantId,
      to,
      subject: emailSubject,
      htmlBody,
      attachments,
      module: "sales",
    });

    if (!result.success) {
      console.error("[CRM Email] Microsoft Graph error:", result.error);
      return { success: false, error: result.error || "Failed to send email" };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[CRM Email] Exception:", err);
    return { success: false, error: err.message || "Unexpected error sending email" };
  }
}
