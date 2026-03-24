"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrokerStore } from "@/store/useBrokerStore";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
import { cn } from "@/lib/utils";
import type { KYCFormData, BrokerAccountStatus } from "@/types/broker";
import {
  User,
  Phone,
  ShieldCheck,
  FileText,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Lock,
} from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const FUNDING_SOURCES = [
  { value: "employment_income", label: "Employment Income" },
  { value: "investments", label: "Investments" },
  { value: "inheritance", label: "Inheritance" },
  { value: "business_income", label: "Business Income" },
  { value: "savings", label: "Savings" },
  { value: "family", label: "Family" },
];

const STEPS = [
  { id: 1, label: "Identity", icon: User },
  { id: 2, label: "Contact", icon: Phone },
  { id: 3, label: "Disclosures", icon: ShieldCheck },
  { id: 4, label: "Agreements", icon: FileText },
  { id: 5, label: "Status", icon: CheckCircle2 },
];

const STATUS_LABELS: Record<string, { label: string; color: string; description: string }> = {
  SUBMITTED: { label: "Submitted", color: "text-amber-400", description: "Your application has been submitted." },
  SUBMISSION_FAILED: { label: "Submission Failed", color: "text-red-400", description: "Submission failed. Please contact support." },
  APPROVAL_PENDING: { label: "Under Review", color: "text-amber-400", description: "Your identity is being verified. This usually takes a few minutes." },
  APPROVED: { label: "Approved", color: "text-emerald-400", description: "Account approved. Finalizing setup..." },
  ACTIVE: { label: "Active", color: "text-emerald-400", description: "Your account is ready to trade!" },
  REJECTED: { label: "Rejected", color: "text-red-400", description: "Your application was rejected. Please contact support." },
  ACTION_REQUIRED: { label: "Action Required", color: "text-amber-400", description: "Additional information is required." },
};

function formatSSN(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const emptyForm: KYCFormData = {
  given_name: "", middle_name: "", family_name: "",
  date_of_birth: "", tax_id: "", tax_id_type: "USA_SSN",
  country_of_citizenship: "USA", country_of_birth: "USA", country_of_tax_residence: "USA",
  funding_source: ["employment_income"],
  email_address: "", phone_number: "",
  street_address: "", unit: "", city: "", state: "", postal_code: "",
  is_control_person: false, is_affiliated_exchange_or_finra: false,
  is_politically_exposed: false, immediate_family_exposed: false,
  customer_agreement: false, account_agreement: false,
};

export default function OnboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isPaid = useSubscriptionStore((s) => s.isPaid);
  const { account, loading, error, createAccount, fetchAccountStatus } = useBrokerStore();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<KYCFormData>(emptyForm);
  const [polling, setPolling] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-fill email from Firebase auth
  useEffect(() => {
    if (user?.email) {
      setForm((f) => ({ ...f, email_address: user.email! }));
    }
  }, [user?.email]);

  // If already onboarded, skip to status
  useEffect(() => {
    if (account?.alpacaAccountId) {
      if (account.status === "ACTIVE" || account.status === "APPROVED") {
        router.push("/account/funding");
      } else {
        setStep(5);
        setPolling(true);
      }
    }
  }, [account, router]);

  // Poll for KYC completion
  useEffect(() => {
    if (!polling || !user) return;
    const id = setInterval(async () => {
      const status = await fetchAccountStatus(user.uid);
      if (status === "ACTIVE" || status === "APPROVED") {
        clearInterval(id);
        setTimeout(() => router.push("/account/funding"), 1500);
      } else if (status === "REJECTED" || status === "SUBMISSION_FAILED") {
        clearInterval(id);
        setPolling(false);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [polling, user, fetchAccountStatus, router]);

  const setField = <K extends keyof KYCFormData>(key: K, value: KYCFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const toggleFundingSource = (value: string) => {
    setForm((f) => ({
      ...f,
      funding_source: f.funding_source.includes(value)
        ? f.funding_source.filter((s) => s !== value)
        : [...f.funding_source, value],
    }));
  };

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!form.given_name.trim()) return "First name is required.";
      if (!form.family_name.trim()) return "Last name is required.";
      if (!form.date_of_birth) return "Date of birth is required.";
      if (form.tax_id.replace(/\D/g, "").length !== 9) return "SSN must be 9 digits.";
      if (form.funding_source.length === 0) return "Select at least one funding source.";
    }
    if (step === 2) {
      if (!form.email_address.includes("@")) return "Valid email is required.";
      if (form.phone_number.replace(/\D/g, "").length < 10) return "Valid phone number is required.";
      if (!form.street_address.trim()) return "Street address is required.";
      if (!form.city.trim()) return "City is required.";
      if (!form.state) return "State is required.";
      if (form.postal_code.replace(/\D/g, "").length !== 5) return "Valid 5-digit ZIP code is required.";
    }
    if (step === 4) {
      if (!form.customer_agreement) return "You must agree to the Customer Agreement.";
      if (!form.account_agreement) return "You must agree to the Account Agreement.";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setSubmitError(null);
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    const err = validateStep();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);
    try {
      await createAccount(user.uid, form);
      setStep(5);
      setPolling(true);
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        Please sign in to continue.
      </div>
    );
  }

  if (!isPaid()) {
    return (
      <div className="min-h-full bg-gradient-to-b from-zinc-950 to-zinc-900 flex items-center justify-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Lock className="size-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Live trading registration requires a paid plan</h2>
          <p className="text-zinc-500 text-sm max-w-xs">
            Upgrade to the <span className="text-emerald-400 font-semibold">Basic</span> or <span className="text-violet-400 font-semibold">Executive</span> plan to register for live trading.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-emerald-400 hover:text-emerald-300 text-sm underline"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full bg-zinc-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all";
  const labelCls = "block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5";
  const checkboxCls = "h-4 w-4 rounded border-white/20 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30";

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 to-zinc-900 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-1">Open Your Brokerage Account</h1>
          <p className="text-sm text-zinc-500">
            Powered by Alpaca Markets · SIPC protected · Sandbox environment
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-10 px-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className={cn(
                    "flex items-center justify-center rounded-full w-9 h-9 border-2 transition-all",
                    done ? "bg-emerald-500 border-emerald-500 text-white" :
                    active ? "border-emerald-500 text-emerald-400 bg-emerald-500/10" :
                    "border-white/10 text-zinc-600 bg-zinc-900",
                  )}>
                    {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider hidden sm:block",
                    active ? "text-emerald-400" : done ? "text-emerald-500" : "text-zinc-600",
                  )}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    "flex-1 h-px mx-2 transition-all",
                    done ? "bg-emerald-500/50" : "bg-white/8",
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-white/8">

          {/* ── Step 1: Identity ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-zinc-100 mb-4">Personal Identity</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input className={inputCls} placeholder="Jane" value={form.given_name}
                    onChange={(e) => setField("given_name", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input className={inputCls} placeholder="Doe" value={form.family_name}
                    onChange={(e) => setField("family_name", e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Middle Name</label>
                <input className={inputCls} placeholder="Optional" value={form.middle_name}
                  onChange={(e) => setField("middle_name", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth *</label>
                <input className={inputCls} type="date" value={form.date_of_birth}
                  max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split("T")[0]}
                  onChange={(e) => setField("date_of_birth", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Social Security Number *</label>
                <input className={inputCls} placeholder="XXX-XX-XXXX" value={form.tax_id}
                  onChange={(e) => setField("tax_id", formatSSN(e.target.value))}
                  maxLength={11} inputMode="numeric" />
                <p className="text-[11px] text-zinc-600 mt-1">Encrypted end-to-end. Never stored on our servers.</p>
              </div>
              <div>
                <label className={labelCls}>Funding Source *</label>
                <div className="grid grid-cols-2 gap-2">
                  {FUNDING_SOURCES.map((fs) => (
                    <label key={fs.value} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer group">
                      <input type="checkbox" className={checkboxCls}
                        checked={form.funding_source.includes(fs.value)}
                        onChange={() => toggleFundingSource(fs.value)} />
                      {fs.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Contact ───────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-zinc-100 mb-4">Contact Information</h2>
              <div>
                <label className={labelCls}>Email Address *</label>
                <input className={inputCls} type="email" placeholder="jane@example.com"
                  value={form.email_address} onChange={(e) => setField("email_address", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Phone Number *</label>
                <input className={inputCls} placeholder="(555) 000-0000"
                  value={form.phone_number} inputMode="numeric"
                  onChange={(e) => setField("phone_number", formatPhone(e.target.value))} />
              </div>
              <div>
                <label className={labelCls}>Street Address *</label>
                <input className={inputCls} placeholder="123 Main St"
                  value={form.street_address} onChange={(e) => setField("street_address", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Unit / Apt</label>
                <input className={inputCls} placeholder="Apt 4B"
                  value={form.unit} onChange={(e) => setField("unit", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={labelCls}>City *</label>
                  <input className={inputCls} placeholder="New York"
                    value={form.city} onChange={(e) => setField("city", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>State *</label>
                  <select className={inputCls} value={form.state}
                    onChange={(e) => setField("state", e.target.value)}>
                    <option value="">—</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ZIP Code *</label>
                  <input className={inputCls} placeholder="10001" maxLength={5}
                    value={form.postal_code} inputMode="numeric"
                    onChange={(e) => setField("postal_code", e.target.value.replace(/\D/g, "").slice(0, 5))} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Disclosures ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-zinc-100 mb-1">Regulatory Disclosures</h2>
              <p className="text-sm text-zinc-500 mb-4">Required by FINRA and SEC regulations. Answer truthfully.</p>
              {[
                {
                  key: "is_control_person" as const,
                  label: "Are you a control person of a publicly traded company?",
                  help: "A director, officer, or 10%+ shareholder.",
                },
                {
                  key: "is_affiliated_exchange_or_finra" as const,
                  label: "Are you affiliated with or work for a registered broker-dealer or FINRA?",
                  help: "Includes exchange employees.",
                },
                {
                  key: "is_politically_exposed" as const,
                  label: "Are you a politically exposed person?",
                  help: "Current or former senior government official.",
                },
                {
                  key: "immediate_family_exposed" as const,
                  label: "Is an immediate family member a politically exposed person?",
                  help: "Spouse, parents, children, siblings.",
                },
              ].map(({ key, label, help }) => (
                <div key={key} className="glass-sm rounded-xl p-4 border border-white/5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-zinc-200 font-medium">{label}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{help}</p>
                    </div>
                    <div className="flex gap-4 shrink-0">
                      {[true, false].map((v) => (
                        <label key={String(v)} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                          <input type="radio" name={key} className={checkboxCls}
                            checked={form[key] === v}
                            onChange={() => setField(key, v)} />
                          {v ? "Yes" : "No"}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 4: Agreements ────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-zinc-100 mb-1">Account Agreements</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Please read and agree to the following agreements to open your account.
              </p>
              {[
                {
                  key: "customer_agreement" as const,
                  label: "Customer Agreement",
                  description: "I agree to the Customer Agreement including terms of service, risk disclosures, and trading rules for the Alpaca Securities brokerage account.",
                },
                {
                  key: "account_agreement" as const,
                  label: "Account Agreement",
                  description: "I agree to the Account Agreement governing the management of my brokerage account, including margin terms and account maintenance.",
                },
              ].map(({ key, label, description }) => (
                <div key={key} className={cn(
                  "glass-sm rounded-xl p-5 border transition-all cursor-pointer",
                  form[key] ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5",
                )} onClick={() => setField(key, !form[key])}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className={cn(checkboxCls, "mt-0.5 shrink-0")}
                      checked={form[key]} onChange={() => setField(key, !form[key])} />
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">{label}</p>
                      <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">{description}</p>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                By submitting, you certify that the information provided is true and accurate.
                Your electronic signature constitutes a legal agreement.
                Timestamp and IP address will be recorded.
              </p>
            </div>
          )}

          {/* ── Step 5: Status ────────────────────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col items-center py-6 gap-6">
              <div className={cn(
                "flex items-center justify-center w-20 h-20 rounded-full",
                account?.status === "ACTIVE" || account?.status === "APPROVED"
                  ? "bg-emerald-500/15"
                  : account?.status === "REJECTED" || account?.status === "SUBMISSION_FAILED"
                  ? "bg-red-500/15"
                  : "bg-amber-500/15",
              )}>
                {polling ? (
                  <Loader2 className="size-8 text-amber-400 animate-spin" />
                ) : account?.status === "ACTIVE" ? (
                  <CheckCircle2 className="size-8 text-emerald-400" />
                ) : (
                  <AlertCircle className="size-8 text-red-400" />
                )}
              </div>

              <div className="text-center">
                <p className={cn(
                  "text-lg font-semibold",
                  STATUS_LABELS[account?.status ?? "SUBMITTED"]?.color ?? "text-zinc-300",
                )}>
                  {STATUS_LABELS[account?.status ?? "SUBMITTED"]?.label ?? account?.status}
                </p>
                <p className="text-sm text-zinc-500 mt-1 max-w-xs">
                  {STATUS_LABELS[account?.status ?? "SUBMITTED"]?.description}
                </p>
              </div>

              {account?.alpacaAccountId && (
                <div className="glass-sm rounded-lg px-4 py-2 text-[11px] text-zinc-500 font-mono">
                  Account ID: {account.alpacaAccountId}
                </div>
              )}

              {polling && (
                <p className="text-[11px] text-zinc-600 animate-pulse">
                  Checking status every 3 seconds…
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {(submitError || error) && step !== 5 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="size-4 shrink-0" />
              {submitError ?? error}
            </div>
          )}

          {/* Navigation */}
          {step < 5 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/5">
              <button
                onClick={handleBack}
                disabled={step === 1}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="size-4" /> Back
              </button>

              {step < 4 ? (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                >
                  Continue <ChevronRight className="size-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><Loader2 className="size-4 animate-spin" /> Submitting…</>
                  ) : (
                    <>Submit Application <CheckCircle2 className="size-4" /></>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
