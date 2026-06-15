import { ScrollArea } from "@/components/ui/scroll-area";

export const TERMS_VERSION = "1.0";
export const TERMS_LAST_UPDATED = "5 June 2026";

export default function TermsAndConditions() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Terms and Conditions of Use</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Version {TERMS_VERSION} — Last updated: {TERMS_LAST_UPDATED}
      </p>
      <TermsContent />
    </div>
  );
}

export function TermsContent({ maxHeight }: { maxHeight?: string }) {
  const content = (
    <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-sm leading-relaxed">
      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">1. Acceptance of Terms</h2>
        <p>
          By accessing or using the AltaSpan business management platform ("the Platform"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you must not access or use the Platform.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">2. Proprietary Software</h2>
        <p>
          The Platform, including all source code, algorithms, pricing models, calculation engines, user interfaces, documentation, and associated intellectual property, is the exclusive property of Anthony Commisso ("the Owner"). All rights not expressly granted herein are reserved.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">3. Licence Grant</h2>
        <p>
          Subject to compliance with these Terms, you are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform solely for legitimate business purposes authorised by the Owner. This licence does not include any right to:
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Copy, reproduce, or duplicate any part of the Platform;</li>
          <li>Modify, adapt, translate, reverse-engineer, decompile, or disassemble the Platform;</li>
          <li>Create derivative works based on the Platform;</li>
          <li>Distribute, sublicence, lease, or lend the Platform to any third party;</li>
          <li>Use the Platform for the benefit of any third party or competing business;</li>
          <li>Extract, scrape, or harvest data, pricing models, or algorithms from the Platform.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">4. Prohibited Conduct</h2>
        <p>You must not:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Share your login credentials with any other person;</li>
          <li>Attempt to gain unauthorised access to any part of the Platform;</li>
          <li>Use the Platform for any unlawful, fraudulent, or inappropriate purpose;</li>
          <li>Introduce viruses, malware, or any harmful code;</li>
          <li>Circumvent or disable any security features or access controls;</li>
          <li>Use automated tools (bots, scrapers, crawlers) to access the Platform;</li>
          <li>Copy, screenshot, or otherwise reproduce pricing data, formulas, or business logic for use outside the Platform;</li>
          <li>Engage in conduct that is abusive, harassing, discriminatory, or otherwise inappropriate;</li>
          <li>Interfere with or disrupt the integrity or performance of the Platform.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">5. Intellectual Property</h2>
        <p>
          All content, data, pricing models, calculation methodologies, trade secrets, and business processes contained within the Platform constitute confidential information and trade secrets of the Owner. Users acknowledge that exposure to such information does not grant any ownership or licence rights beyond those expressly stated herein.
        </p>
        <p className="mt-2">
          Any data you input into the Platform remains your property; however, you grant the Owner a non-exclusive licence to store, process, and back up such data as necessary to provide the Platform services.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">6. Confidentiality</h2>
        <p>
          You agree to maintain the confidentiality of all proprietary information accessed through the Platform, including but not limited to: pricing structures, cost models, markup calculations, supplier rates, client data, and business processes. This obligation survives termination of your access.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">7. Data Protection</h2>
        <p>
          The Platform processes personal and business data in accordance with applicable Australian privacy legislation, including the Privacy Act 1988 (Cth) and the Australian Privacy Principles. You must not input data into the Platform that you do not have lawful authority to process.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">8. Account Security</h2>
        <p>
          You are responsible for maintaining the security of your account credentials. You must immediately notify the Owner of any unauthorised access or suspected security breach. The Owner is not liable for any loss arising from unauthorised use of your account.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">9. Acceptable Use</h2>
        <p>
          You agree to use the Platform only for its intended business purpose. The Platform is provided for internal business operations and must not be used to provide services to third parties, benchmark against competitors, or for any purpose that competes with the Owner's business interests.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">10. Termination</h2>
        <p>
          The Owner may suspend or terminate your access at any time, with or without cause, and with or without notice. Upon termination, your licence to use the Platform immediately ceases, and you must destroy any copies of Platform materials in your possession.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">11. Disclaimer of Warranties</h2>
        <p>
          The Platform is provided "as is" without warranty of any kind, express or implied. The Owner does not warrant that the Platform will be uninterrupted, error-free, or free of harmful components. To the maximum extent permitted by law, all implied warranties are excluded.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">12. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, the Owner shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Platform, regardless of the cause of action.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">13. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless the Owner from any claims, damages, losses, or expenses (including legal fees) arising from your breach of these Terms, your misuse of the Platform, or your violation of any applicable law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">14. Modifications to Terms</h2>
        <p>
          The Owner reserves the right to modify these Terms at any time. Material changes will require re-acceptance before continued use of the Platform. Continued use after notification of changes constitutes acceptance of the modified Terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">15. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the Australian Capital Territory, Australia. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of the Australian Capital Territory.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">16. Severability</h2>
        <p>
          If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mt-4 mb-2">17. Entire Agreement</h2>
        <p>
          These Terms constitute the entire agreement between you and the Owner regarding the use of the Platform and supersede all prior agreements, understandings, and representations.
        </p>
      </section>

      <section className="border-t pt-4 mt-6">
        <p className="text-xs text-muted-foreground">
          © Anthony Commisso 2026. All rights reserved. Unauthorised reproduction or distribution of this Platform or any portion of it may result in civil and criminal penalties.
        </p>
      </section>
    </div>
  );

  if (maxHeight) {
    return (
      <ScrollArea className={`${maxHeight} pr-4`}>
        {content}
      </ScrollArea>
    );
  }

  return content;
}
