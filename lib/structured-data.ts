import { absoluteUrl, SITE_NAME } from '@/lib/site';
import { FAQS } from '@/lib/faq-data';

/**
 * Shared JSON-LD blocks, injected via <script type="application/ld+json"> so
 * search engines and AI crawlers can parse the product without rendering.
 *
 * The numbers below mirror the copy on the landing page. Keep the two in
 * sync: when the marketing copy changes its figures, this file changes too.
 */

/** Organization + SoftwareApplication, the pair Google surfaces as a rich
 *  result for "restaurant management software" type queries. */
export function softwareJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${absoluteUrl('/')}#org`,
        name: SITE_NAME,
        url: absoluteUrl('/'),
        logo: absoluteUrl('/icon.svg'),
        description: 'Restaurant management software built in Nepal for Nepal.',
        // Geographic focus is a real ranking signal for local-market queries
        // ("restaurant software Kathmandu"); schema.org has no "Nepal"
        // constant, so ISO code it is.
        areaServed: { '@type': 'Country', name: 'Nepal' },
        sameAs: [],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${absoluteUrl('/')}#software`,
        name: SITE_NAME,
        url: absoluteUrl('/'),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description:
          'Orders, kitchen tickets, IRD-compliant VAT billing, tables and ' +
          'inventory in one dashboard for restaurants in Nepal.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'NPR',
          description: 'Free forever plan, no credit card required.',
        },
        // Deliberately no aggregateRating. The landing page shows "4.9/5" and
        // "500+ kitchens", but Google's review-snippet policy only permits
        // ratings collected from genuine, independently verifiable reviews.
        // Emitting self-declared stars is a manual-action risk that would cost
        // far more than the rich result is worth. Add this back if and when
        // the ratings come from a real review source.
        publisher: { '@id': `${absoluteUrl('/')}#org` },
      },
    ],
  };
}

/**
 * FAQPage, derived from the same array the accordion renders. Google requires
 * the structured data to match the on-page text, so this must never be a
 * hand-copied second version of the copy.
 */
export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };
}

/**
 * WebSite node, which is what lets an engine treat the domain as one entity
 * rather than a pile of unrelated URLs.
 */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${absoluteUrl('/')}#website`,
    url: absoluteUrl('/'),
    name: SITE_NAME,
    inLanguage: 'en-NP',
    publisher: { '@id': `${absoluteUrl('/')}#org` },
  };
}
