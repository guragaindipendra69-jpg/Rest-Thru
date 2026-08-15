'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Loader2 } from 'lucide-react';
import Navbar from '@/components/shared/navbar';
import Footer from '@/components/shared/footer';
import { PricingCard } from '@/components/shared/pricing-card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getPublicPlans, type PublicPlan } from '@/lib/actions/get-plans-public';
import { PLAN_LIMITS, type FeatureFlag, type PlanType } from '@/lib/plan-limits';

const accentColors: Record<string, 'gray' | 'indigo' | 'emerald' | 'amber'> = {
  free: 'gray',
  basic: 'indigo',
  pro: 'emerald',
  enterprise: 'amber',
};

// Comparison rows come in three kinds, and only the last one is editorial.
//
// `cap`  - a numeric limit, rendered as the actual figure from the plan row.
//          A cap is not a yes/no capability: rendering "Up to 5 menu items"
//          as a tick made every paid tier show a red cross, i.e. "no menu
//          items", which is exactly backwards on a page that sells them.
// `flag` - a boolean capability resolved from PLAN_LIMITS[type].features, so
//          this table cannot drift from lib/plan-limits.ts the way the old
//          hand-written map had.
// `text` - support tier. There is no feature flag for it, so it stays copy.
type ComparisonRow =
  | { label: string; cap: 'maxTables' | 'maxMenuItems' | 'maxStaff' | 'maxRestaurants' }
  | { label: string; flag: FeatureFlag }
  | { label: string; text: Partial<Record<PlanType, string>> };

const comparisonFeatures: { category: string; items: ComparisonRow[] }[] = [
  {
    category: 'Capacity',
    items: [
      { label: 'Tables', cap: 'maxTables' },
      { label: 'Menu items', cap: 'maxMenuItems' },
      { label: 'Staff accounts', cap: 'maxStaff' },
      { label: 'Locations', cap: 'maxRestaurants' },
    ],
  },
  {
    category: 'Orders & Menu',
    items: [
      { label: 'Live order tracking', flag: 'ORDER_TRACKING' },
      { label: 'Multiple payment methods', flag: 'MULTIPLE_PAYMENTS' },
    ],
  },
  {
    category: 'Staff & Inventory',
    items: [{ label: 'Staff roster & roles', flag: 'STAFF_MANAGEMENT' }],
  },
  {
    category: 'Reports & Billing',
    items: [
      { label: 'IRD-compliant VAT billing', flag: 'VAT_BILLING' },
      { label: 'Real-time analytics', flag: 'REALTIME_ANALYTICS' },
    ],
  },
  {
    category: 'Integrations',
    items: [
      { label: 'Thermal printer support', flag: 'THERMAL_PRINTER' },
      { label: 'API access', flag: 'API_ACCESS' },
    ],
  },
  {
    category: 'Support',
    items: [
      {
        label: 'Support',
        text: {
          FREE: 'Email',
          BASIC: 'Priority email',
          PRO: 'Phone & email',
          ENTERPRISE: 'Dedicated',
        },
      },
    ],
  },
];

const faqItems = [
  {
    id: '1',
    question: 'Can I try before paying?',
    answer:
      'Yes! Start with our Free plan forever, or try Pro features free for 14 days. No credit card required. Cancel anytime without any penalties.',
  },
  {
    id: '2',
    question: 'Do you support thermal printers?',
    answer:
      'Yes, we support ESC/POS thermal printers out of the box. Perfect for kitchen receipts and order tickets. Available on Basic and Pro plans.',
  },
  {
    id: '3',
    question: 'Can I switch plans later?',
    answer:
      'Yes, you can upgrade or downgrade your plan anytime from your account settings. Upgrades take effect immediately; downgrades apply at the start of your next billing cycle.',
  },
  {
    id: '4',
    question: 'Is the billing IRD compliant?',
    answer:
      'Yes, Pro and Enterprise plans include IRD-compliant VAT billing with automatic tax calculations and compliance reports for Nepal.',
  },
  {
    id: '5',
    question: 'Can I cancel anytime?',
    answer:
      'Absolutely. No lock-in contracts or hidden fees. Cancel your subscription anytime from your account settings. You\'ll keep access until the end of your billing period.',
  },
  {
    id: '6',
    question: 'What payment methods do customers see?',
    answer:
      'Pro plan supports Cash, eSewa, Khalti, and Fonepay. Your customers can choose their preferred payment method at checkout.',
  },
  {
    id: '7',
    question: 'How does multi-branch work?',
    answer:
      'Pro supports up to 3 branches with centralized management. Enterprise plans offer unlimited branches with custom setup and dedicated support.',
  },
  {
    id: '8',
    question: 'Is my data secure?',
    answer:
      'We use bank-grade encryption (TLS 1.3) for all data in transit and at rest. Regular backups, DDoS protection, and compliance with international security standards.',
  },
];

// The DB `plan.type` is a free-form string, and its display name is not its
// type (BASIC is sold as "Growth", PRO as "Enterprise"), so it has to be
// narrowed to a PlanType before PLAN_LIMITS can be indexed. Returning null for
// an unrecognised type is deliberate: the previous map returned `undefined` on
// a miss, which React rendered as a red cross, so a plan the page did not know
// about silently advertised *no* features rather than showing nothing.
function toPlanType(type: string): PlanType | null {
  const key = type.toUpperCase();
  return key in PLAN_LIMITS ? (key as PlanType) : null;
}

// 9999 is the seed's "unlimited" sentinel for a cap column; PLAN_LIMITS uses
// Infinity for the same idea. Treat both as unlimited.
function formatCap(value: number): string {
  if (!Number.isFinite(value) || value >= 9999) return 'Unlimited';
  return String(value);
}

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicPlans().then((data) => { setPlans(data); setLoading(false); });
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Header Section */}
      <motion.section
        className="relative px-4 py-16 sm:px-6 lg:px-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Simple, Honest Pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            No hidden fees. Cancel anytime.
          </p>

          {/* Toggle Section */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className={cn('text-sm font-medium', !isYearly && 'text-foreground')}>Monthly</span>
            <Switch
              checked={isYearly}
              onCheckedChange={setIsYearly}
              className="data-[state=checked]:bg-primary"
            />
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-medium', isYearly && 'text-foreground')}>Yearly</span>
              {isYearly && (
                <Badge variant="secondary" className="bg-primary-light text-primary">
                  Save 20%
                </Badge>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Pricing Cards Section */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <motion.section
          className="px-4 py-12 sm:px-6 lg:px-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan, idx) => {
                const typeKey = plan.type.toLowerCase() as keyof typeof accentColors;
                return (
                  <motion.div key={plan.id || idx} variants={itemVariants}>
                    <PricingCard
                      name={plan.name}
                      price={plan.price}
                      yearlyPrice={plan.yearlyPrice}
                      features={plan.features}
                      isPopular={plan.isPopular}
                      accentColor={accentColors[typeKey] || 'gray'}
                      ctaText={plan.price === 0 ? 'Get Started' : typeKey === 'enterprise' ? 'Contact Sales' : 'Start Free Trial'}
                      isYearly={isYearly}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.section>
      )}

      {/* Feature Comparison Table Section */}
      {!loading && plans.length > 0 && (
        <motion.section
          className="px-4 py-16 sm:px-6 lg:px-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="mx-auto max-w-7xl">
            <h2 className="text-3xl font-bold text-center mb-12">Feature Comparison</h2>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Feature</th>
                    {plans.map((plan) => (
                      <th key={plan.id} className="px-6 py-4 text-center font-semibold">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((section, sectionIdx) => (
                    <React.Fragment key={sectionIdx}>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={plans.length + 1} className="px-6 py-3 font-semibold text-sm">
                          {section.category}
                        </td>
                      </tr>
                      {section.items.map((row, featureIdx) => (
                        <tr
                          key={featureIdx}
                          className={cn(
                            'border-t',
                            featureIdx % 2 === 0 ? 'bg-background' : 'bg-muted/50'
                          )}
                        >
                          <td className="px-6 py-4 text-left text-foreground">{row.label}</td>
                          {plans.map((plan) => {
                            const planType = toPlanType(plan.type);
                            return (
                              <td key={plan.id} className="px-6 py-4 text-center">
                                {'cap' in row ? (
                                  <span className="font-medium text-foreground">
                                    {formatCap(plan[row.cap])}
                                  </span>
                                ) : 'text' in row ? (
                                  <span className="text-foreground">
                                    {(planType && row.text[planType]) || '-'}
                                  </span>
                                ) : planType && PLAN_LIMITS[planType].features.includes(row.flag) ? (
                                  <Check
                                    className="mx-auto h-5 w-5 text-success"
                                    aria-label={`${row.label} included`}
                                  />
                                ) : (
                                  <X
                                    className="mx-auto h-5 w-5 text-destructive"
                                    aria-label={`${row.label} not included`}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>
      )}

      {/* FAQ Section */}
      <motion.section
        className="px-4 py-16 sm:px-6 lg:px-8"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>

          <Accordion type="single" collapsible className="space-y-4">
            {faqItems.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border rounded-lg px-6 bg-card data-[state=open]:bg-muted/30"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <span className="font-semibold text-left">{item.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section
        className="px-4 py-16 sm:px-6 lg:px-8"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">Ready to get started?</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join hundreds of restaurants already using Resthru to streamline their operations.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <a
              href="/register"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors"
            >
              Start Free Trial
            </a>
            <a
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg border border-border-strong bg-background font-medium hover:bg-accent transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </motion.section>

      <Footer />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
