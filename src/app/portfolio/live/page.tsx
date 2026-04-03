/**
 * Live Portfolio — DISABLED in demo/beta mode.
 * Original implementation preserved in git history.
 */
export default function LivePortfolioPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center flex flex-col items-center gap-4 max-w-xs">
        <h2 className="text-base font-semibold text-zinc-100">Live Portfolio</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Live trading is not available during the beta period. Paper trading is available now.
        </p>
      </div>
    </div>
  );
}
