import Navbar from "@/components/shared/navbar";
import { HeroSection } from "@/components/shared/hero-section";
import { SocialProofBar } from "@/components/shared/social-proof-bar";
import { FeaturesGrid } from "@/components/shared/features-grid";
import { HowItWorks } from "@/components/shared/how-it-works";
import { PricingPreview } from "@/components/shared/pricing-preview";
import { TestimonialsSection } from "@/components/shared/testimonials-section";
import { NepalSection } from "@/components/shared/nepal-section";
import { FaqSection } from "@/components/shared/faq-section";
import { CtaBanner } from "@/components/shared/cta-banner";
import Footer from "@/components/shared/footer";
import { JsonLd } from "@/components/shared/json-ld";
import { faqJsonLd, softwareJsonLd, websiteJsonLd } from "@/lib/structured-data";

/**
 * Statically prerendered. This page previously set `force-dynamic`, which
 * rebuilt the whole landing page on every request -- slower Core Web Vitals
 * (a ranking factor) for zero benefit, since none of these sections read
 * cookies, headers or the database. Verified before removing it.
 */
export const revalidate = 3600;

export default function Home() {
  return (
    <>
      {/* Emitted server-side so crawlers that never run JavaScript still see
          the product described. Placed on the page rather than the root layout
          because the FAQ block is specific to this page's content. */}
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={softwareJsonLd()} />
      <JsonLd data={faqJsonLd()} />

      <main className="min-h-screen">
        <Navbar overlay />
        <HeroSection />
        <SocialProofBar />
        <FeaturesGrid />
        <HowItWorks />
        <PricingPreview />
        <TestimonialsSection />
        <NepalSection />
        <FaqSection />
        <CtaBanner />
        <Footer />
      </main>
    </>
  );
}
