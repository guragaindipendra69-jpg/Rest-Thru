'use client';

import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
// Shared with the FAQPage JSON-LD so the markup and the visible copy cannot
// disagree. Edit the answers in lib/faq-data.ts.
import { FAQS as faqs } from '@/lib/faq-data';

export function FaqSection() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mb-10 text-center"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            FAQ
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight text-foreground">
            The stuff owners usually ask
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm sm:text-base text-muted-foreground">
            The questions we get most, answered plainly.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                className="rounded-xl border border-border/50 bg-card px-5 data-[state=open]:border-primary/20 data-[state=open]:shadow-sm"
              >
                <AccordionTrigger className="py-4 text-sm sm:text-base font-medium text-foreground hover:text-primary transition-colors">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
