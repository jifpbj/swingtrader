/**
 * Account Funding — DISABLED in demo/beta mode.
 * Original ACH/transfer flow preserved in git history.
 * Re-enable by restoring the full implementation when live trading launches.
 */
export default function FundingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center flex flex-col items-center gap-4 max-w-xs">
        <div className="size-12 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center mb-2">
          <svg className="size-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-zinc-100">Account Funding</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Coming soon. Live trading and ACH funding will be available in a future release.
        </p>
      </div>
    </div>
  );
}
