/**
 * Live Trading Registration — DISABLED in demo/beta mode.
 * Original KYC onboarding flow preserved in git history.
 * Re-enable by restoring the full implementation when live trading launches.
 */
export default function OnboardPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center flex flex-col items-center gap-4 max-w-xs">
        <div className="size-12 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center mb-2">
          <svg className="size-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-zinc-100">Live Trading Registration</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Coming soon. Paper trading is available now — connect your Alpaca paper account via the API Keys menu.
        </p>
      </div>
    </div>
  );
}
