/**
 * Landing-page FAQ copy.
 *
 * Extracted from faq-section.tsx so the rendered accordion and the FAQPage
 * JSON-LD read from one array. Google requires structured data to match the
 * visible text -- a mismatch is a manual-action risk, not just a wasted
 * signal -- and two hand-maintained copies drift the first time someone edits
 * a single answer.
 *
 * Plain data in a .ts module with no 'use client', so the Server Component
 * that emits the JSON-LD and the client accordion can both import it.
 */

export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: 'How long does it take to set up?',
    a: 'Most restaurants go from sign-up to live orders in under 5 minutes. Add your menu items, set up table layouts, print QR codes, and start serving.',
  },
  {
    q: 'Does it work without internet?',
    a: "Yes. Resthru is built for Nepal's connectivity. Orders, billing, and inventory all work offline and sync automatically when the connection returns.",
  },
  {
    q: 'Is it compliant with IRD billing?',
    a: 'Absolutely. Every bill generated through Resthru is IRD-compliant with automatic tax calculation and fiscal year reporting built in.',
  },
  {
    q: 'Can I accept eSewa and Khalti payments?',
    a: 'Yes. Resthru integrates directly with eSewa and Khalti for seamless digital payments. Your customers can pay by scanning a QR code at the table.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. Our Starter plan is free forever with no credit card required. It includes up to 5 tables, basic QR ordering, and manual billing. Upgrade when you outgrow it.',
  },
  {
    q: 'Can I manage multiple locations?',
    a: 'Yes, with our Enterprise plan. You get multi-location support, advanced analytics, API access, and a dedicated account manager.',
  },
];
