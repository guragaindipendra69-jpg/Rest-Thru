'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, UtensilsCrossed, ArrowRight, Smartphone, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { register } from '@/lib/actions/auth';
import { GoogleSignInButton } from '@/components/shared/google-sign-in';
import { GoogleRegistrationDialog } from '@/components/shared/google-registration-dialog';
import { NEPAL_CITIES, RESTAURANT_TYPES } from '@/lib/constants';
import { getPublicPlans, type PublicPlan } from '@/lib/actions/get-plans-public';
import { consumeSelectedPlan } from '@/lib/selected-plan';
import { phoneSchema, phonePlaceholder } from '@/lib/phone-validator';

const step1Schema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  phone: phoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const step2Schema = z.object({
  restaurantName: z.string().min(2, 'Restaurant name is required'),
  restaurantType: z.string().min(1, 'Restaurant type is required'),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  restaurantPhone: phoneSchema,
});

const step3Schema = z.object({
  selectedPlan: z.string().min(1, 'Please select a plan'),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

interface FormData {
  step1: Partial<Step1Data>;
  step2: Partial<Step2Data>;
  step3: Partial<Step3Data>;
}

const ALL_STEPS = ['Account', 'Restaurant', 'Plan'];
// The confirmation screen lives one past the last input step. It is a fixed
// index (not steps.length + 1) because the number of input steps now varies:
// a visitor who already picked a plan on /pricing skips the Plan step.
const SUCCESS_STEP = 4;

export default function RegisterPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    step1: {},
    step2: {},
    step3: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [usePersonalPhone, setUsePersonalPhone] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [desiredPlanId, setDesiredPlanId] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<{ id: string; email: string; firstName: string; lastName: string; picture: string; alreadyRegistered?: boolean; ticket?: string } | null>(null);

  useEffect(() => {
    getPublicPlans().then(setPlans);
  }, []);

  // Capture the plan the visitor clicked in the pricing section: the ?plan=
  // query param wins, with the sessionStorage copy as a fallback. Consume the
  // stored value regardless so it can't linger and pre-select later.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('plan');
    const stored = consumeSelectedPlan();
    setDesiredPlanId(fromUrl || stored);
  }, []);

  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const step2Form = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { restaurantName: '', restaurantType: '', address: '', city: '', restaurantPhone: '' },
  });

  const step3Form = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: { selectedPlan: '' },
  });

  // Resolve the pre-picked plan (from ?plan= or sessionStorage) against the
  // loaded plan list. Matching by id first, then by type, because /pricing links
  // carry a type slug ("pro") while the DB rows are keyed by id.
  const preselectedPlan = useMemo(() => {
    if (!desiredPlanId || plans.length === 0) return null;
    return plans.find((p) => p.id === desiredPlanId || p.type === desiredPlanId) ?? null;
  }, [desiredPlanId, plans]);

  // When the visitor already chose a plan on the pricing page, the Plan step is
  // dropped entirely: re-asking "which plan?" after they told us — and after
  // they filled in two screens of details — was the single biggest source of
  // drop-off in the signup flow. Their choice is instead confirmed inline on the
  // Restaurant step, where it stays visible and changeable.
  const skipPlanStep = preselectedPlan !== null;
  const steps = useMemo(
    () => (skipPlanStep ? ALL_STEPS.slice(0, 2) : ALL_STEPS),
    [skipPlanStep]
  );
  const lastInputStep = steps.length;

  useEffect(() => {
    if (preselectedPlan) {
      step3Form.setValue('selectedPlan', preselectedPlan.id, { shouldValidate: true });
    }
  }, [preselectedPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUsePersonalPhone = (checked: boolean) => {
    setUsePersonalPhone(checked);
    if (checked) {
      const personalPhone = step1Form.getValues('phone');
      step2Form.setValue('restaurantPhone', personalPhone);
    } else {
      step2Form.setValue('restaurantPhone', '');
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      router.push('/');
    }
  };

  // step1/step2 are passed in explicitly rather than read from `formData`.
  // The callers do setFormData(...) immediately before calling this, and React
  // state updates are asynchronous — so reading formData here saw the *previous*
  // render's value. planId in particular was always undefined, which meant no
  // Subscription row was ever created for a new signup, whatever plan was picked.
  const handleSubmit = async (step1: Step1Data, step2: Step2Data, planId?: string) => {
    setIsLoading(true);
    try {
      const result = await register({
        email: step1.email,
        password: step1.password,
        fullName: step1.fullName,
        phone: step1.phone,
        restaurantName: step2.restaurantName,
        restaurantType: step2.restaurantType || 'CASUAL_DINING',
        address: step2.address,
        city: step2.city,
        restaurantPhone: step2.restaurantPhone,
        planId,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Account created successfully!');
      setCurrentStep(SUCCESS_STEP);
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const goToDashboard = () => router.push('/owner');

  const stepLabels: Record<number, { title: string; subtitle: string }> = {
    1: { title: 'Create your account', subtitle: 'Enter your details to get started' },
    2: { title: 'Restaurant details', subtitle: 'Tell us about your restaurant' },
    3: { title: 'Choose your plan', subtitle: 'Select the best plan for you' },
  };

  return (
    <div className="min-h-screen flex bg-[linear-gradient(145deg,_#041a12_0%,_#0a4d36_35%,_#0e7a52_65%,_#12a068_100%)]">
      {/* Left Panel - Stepper */}
      <div className="hidden lg:flex lg:w-2/5 bg-gradient-to-br from-primary/90 via-primary-hover/90 to-primary-deep flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.04]" />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/[0.04] blur-[120px]" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand/[0.10] blur-[100px]" />
        </div>

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-xl">
              <UtensilsCrossed className="w-8 h-8 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Resthru</span>
          </Link>
        </div>

        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-white mb-8">Setup in 3 simple steps</h2>
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                  idx + 1 === currentStep
                    ? 'bg-white/15'
                    : idx + 1 < currentStep
                    ? 'bg-white/10'
                    : ''
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    idx + 1 < currentStep
                      ? 'bg-white text-primary'
                      : idx + 1 === currentStep
                      ? 'bg-white/20 text-white'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  {idx + 1 < currentStep ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={`text-sm font-medium ${
                    idx + 1 <= currentStep ? 'text-white' : 'text-white/80'
                  }`}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-sm text-white/80">Trusted by 500+ restaurants in Nepal</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-12 bg-sunken dark:bg-background relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/[0.02] blur-[150px]" />
          <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-brand/[0.06] blur-[120px]" />
        </div>
        <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full">
          {/* Mobile Header */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <UtensilsCrossed className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-primary">Resthru</span>
            </Link>
          </div>

          {/* Progress (mobile) */}
          {currentStep < SUCCESS_STEP && (
            <div className="lg:hidden mb-8">
              <div className="flex gap-2 mb-3">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      idx + 1 < currentStep
                        ? 'bg-primary'
                        : idx + 1 === currentStep
                        ? 'bg-primary'
                        : 'bg-border/50'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Step {currentStep} of {steps.length}
              </p>
            </div>
          )}

          {/* Step Header */}
          {currentStep < SUCCESS_STEP && stepLabels[currentStep] && (
            <motion.div
              key={`header-${currentStep}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h1 className="text-3xl font-bold">{stepLabels[currentStep].title}</h1>
              <p className="mt-2 text-muted-foreground">{stepLabels[currentStep].subtitle}</p>
            </motion.div>
          )}

          {/* Form Steps */}
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Card className="border border-white/20 bg-white/95 shadow-xl shadow-primary/5 backdrop-blur-xl">
                  <CardContent className="p-6 sm:p-8">
                    <GoogleSignInButton
                      text="Sign up with Google"
                      className="mb-6"
                      onSuccess={(user) => setGoogleUser(user)}
                    />
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border/60" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-3 text-muted-foreground/70 font-medium tracking-wider">or fill in details</span>
                      </div>
                    </div>
                    <Form {...step1Form}>
                      <form id="register-form" onSubmit={step1Form.handleSubmit((data) => { setFormData((prev) => ({ ...prev, step1: data })); setCurrentStep(2); })} className="space-y-4">
                        <FormField control={step1Form.control} name="fullName" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Full Name</FormLabel>
                            <FormControl><Input placeholder="John Doe" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={step1Form.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Email Address</FormLabel>
                            <FormControl><Input placeholder="you@example.com" type="email" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={step1Form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Phone Number</FormLabel>
                            <FormControl><Input placeholder="98XXXXXXXX (Nepal mobile)" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField control={step1Form.control} name="password" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Password</FormLabel>
                              <FormControl><Input placeholder="At least 8 characters" type="password" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={step1Form.control} name="confirmPassword" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Confirm Password</FormLabel>
                              <FormControl><Input placeholder="Repeat password" type="password" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Card className="border border-white/20 bg-white/95 shadow-xl shadow-primary/5 backdrop-blur-xl">
                  <CardContent className="p-6 sm:p-8">
                    <Form {...step2Form}>
                      <form id="register-form" onSubmit={step2Form.handleSubmit(async (data) => {
                        setFormData((prev) => ({ ...prev, step2: data }));
                        // Plan already chosen on /pricing: submit straight from
                        // here instead of walking the visitor through a step
                        // whose only question they have already answered.
                        if (skipPlanStep) {
                          await handleSubmit(step1Form.getValues(), data, preselectedPlan!.id);
                        } else {
                          setCurrentStep(3);
                        }
                      })} className="space-y-4">
                        {/* Confirms the plan carried over from /pricing so the
                            skipped step never feels like a silent assumption.
                            "Change" re-opens the full picker on demand. */}
                        {preselectedPlan && (
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary-light/40 px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-muted-foreground">Selected plan</p>
                              <p className="truncate text-sm font-semibold">
                                {preselectedPlan.name}
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                  {preselectedPlan.price === 0
                                    ? 'Free'
                                    : `${preselectedPlan.price} ${preselectedPlan.currency}/mo`}
                                </span>
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="flex-shrink-0 text-primary hover:text-primary-hover"
                              onClick={() => {
                                setDesiredPlanId(null);
                                setCurrentStep(3);
                              }}
                            >
                              Change
                            </Button>
                          </div>
                        )}
                        <FormField control={step2Form.control} name="restaurantName" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Restaurant Name</FormLabel>
                            <FormControl><Input placeholder="Your Restaurant Name" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField control={step2Form.control} name="restaurantType" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Restaurant Type</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl><SelectTrigger className="h-11 border-border/60"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                                <SelectContent>{RESTAURANT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={step2Form.control} name="city" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">City</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl><SelectTrigger className="h-11 border-border/60"><SelectValue placeholder="Select city" /></SelectTrigger></FormControl>
                                <SelectContent>{NEPAL_CITIES.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}</SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                        <FormField control={step2Form.control} name="address" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Address</FormLabel>
                            <FormControl><Input placeholder="Street address" className="h-11 border-border/60 focus:border-primary transition-colors" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5">
                            <Checkbox id="usePersonalPhone" checked={usePersonalPhone} onCheckedChange={(val) => handleUsePersonalPhone(val === true)} />
                            <Label htmlFor="usePersonalPhone" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                              Use my personal number as restaurant phone
                            </Label>
                          </div>
                          <FormField control={step2Form.control} name="restaurantPhone" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1.5 text-sm font-semibold">
                                Restaurant Phone
                              </FormLabel>
                              <FormControl><Input placeholder="98XXXXXXXX (Nepal mobile)" className="h-11 border-border/60 focus:border-primary transition-colors" disabled={usePersonalPhone} {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Card className="border border-white/20 bg-white/95 shadow-xl shadow-primary/5 backdrop-blur-xl">
                  <CardContent className="p-6 sm:p-8">
                    <Form {...step3Form}>
                      <form id="register-form" onSubmit={step3Form.handleSubmit(async (data) => {
                        setFormData((prev) => ({ ...prev, step3: data }));
                        await handleSubmit(step1Form.getValues(), step2Form.getValues(), data.selectedPlan);
                      })} className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {plans.map((plan) => (
                            <FormField key={plan.id} control={step3Form.control} name="selectedPlan" render={({ field }) => (
                              <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className={`relative rounded-xl border-2 p-5 cursor-pointer transition-all ${
                                  field.value === plan.id
                                    ? 'border-primary bg-primary-light/50 shadow-md shadow-primary/10'
                                    : 'border-border/60 hover:border-primary/40 bg-white/50'
                                }`}
                                onClick={() => field.onChange(plan.id)}
                              >
                                {plan.isPopular && (
                                  <div className="absolute -top-2.5 left-4 bg-gradient-to-r from-primary to-primary-hover text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-sm">
                                    Popular
                                  </div>
                                )}
                                <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                                <p className="text-2xl font-bold text-primary mb-3">
                                  {plan.price === 0 ? 'Free' : `${plan.price} ${plan.currency}`}
                                  {plan.price !== 0 && <span className="text-sm text-muted-foreground font-normal">/mo</span>}
                                </p>
                                <ul className="space-y-1.5">
                                  {plan.features.slice(0, 3).map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                      <span>{feature}</span>
                                    </li>
                                  ))}
                                </ul>
                                {field.value === plan.id && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute top-4 right-4 bg-primary text-white rounded-full p-1 shadow-sm"
                                  >
                                    <Check className="w-3 h-3" />
                                  </motion.div>
                                )}
                              </motion.div>
                            )} />
                          ))}
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentStep === SUCCESS_STEP && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Card className="border-0 shadow-2xl bg-gradient-to-br from-success/[0.08] to-primary-light/30 backdrop-blur-xl">
                  <CardContent className="p-8 sm:p-12 text-center">
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: 2 }}>
                      <div className="w-16 h-16 bg-gradient-to-br from-success to-success/80 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-success/20">
                        <Check className="w-8 h-8 text-white" strokeWidth={3} />
                      </div>
                    </motion.div>
                    <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                      Welcome to Resthru!
                    </h2>
                    <p className="text-muted-foreground mb-8">
                      {formData.step2.restaurantName} is all set up and ready to go.
                    </p>
                    <div className="inline-flex flex-col gap-1.5 text-sm text-muted-foreground mb-8 bg-white/60 rounded-lg px-5 py-3 border border-border/30">
                      <span className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Account created</span>
                      <span className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Restaurant profile set up</span>
                      <span className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Plan selected</span>
                    </div>
                    <Button onClick={goToDashboard} className="w-full sm:w-auto bg-gradient-to-r from-success to-success/90 hover:from-success/90 hover:to-success/80 text-white font-semibold h-11 px-8 shadow-md shadow-success/20">
                      Go to Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          {currentStep < SUCCESS_STEP && (
            <motion.div
              key={`nav-${currentStep}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex gap-3 mt-6"
            >
              <Button variant="outline" onClick={handlePreviousStep} disabled={isLoading} className="flex-1 h-11 border-border/60 font-medium">
                <ChevronLeft className="w-4 h-4 mr-2" />
                {currentStep === 1 ? 'Cancel' : 'Back'}
              </Button>
              <Button type="submit" form="register-form" disabled={isLoading} className="flex-1 h-11 bg-primary hover:bg-primary-hover text-white font-semibold shadow-md shadow-primary/20">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {currentStep === lastInputStep ? 'Create Account' : 'Continue'}
                    <ChevronRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </motion.div>
          )}

          {currentStep < SUCCESS_STEP && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:text-primary-hover font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Google Registration Dialog */}
      {googleUser && (
        <GoogleRegistrationDialog
          open={!!googleUser}
          onOpenChange={(open) => { if (!open) setGoogleUser(null); }}
          user={googleUser}
          alreadyRegistered={googleUser.alreadyRegistered}
        />
      )}
    </div>
  );
}
