"""
Email Service — Resend-backed transactional email
──────────────────────────────────────────────────
Uses httpx (already a project dependency) to POST to the Resend REST API.
All public helpers are fire-and-forget: they NEVER raise exceptions so a
failed email cannot interrupt trade execution.

SETUP:
  1. Sign up at https://resend.com (free tier: 3 000 emails/month)
  2. Verify your sending domain → create an API key
  3. Set in backend/.env:
       RESEND_API_KEY=re_...
       EMAIL_FROM=Predict Alpha <notifications@yourdomain.com>
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_RESEND_URL = "https://api.resend.com/emails"

# ─── Low-level sender ────────────────────────────────────────────────────────


async def send_email(to: str, subject: str, html: str) -> None:
    """
    POST one email via Resend API.
    Logs a warning on non-2xx responses but never raises.
    """
    settings = get_settings()
    if not settings.resend_api_key:
        logger.debug("email_skipped_no_api_key", to=to, subject=subject)
        return

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from":    settings.email_from,
        "to":      [to],
        "subject": subject,
        "html":    html,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(_RESEND_URL, json=payload, headers=headers)
        if resp.is_success:
            logger.info("email_sent", to=to, subject=subject, status=resp.status_code)
        else:
            logger.warning(
                "email_send_failed",
                to=to, subject=subject,
                status=resp.status_code,
                body=resp.text[:300],
            )
    except Exception as exc:
        logger.warning("email_send_error", to=to, subject=subject, error=str(exc))


# ─── Shared HTML wrapper ─────────────────────────────────────────────────────

def _html_wrapper(badge_color: str, badge_label: str, rows: list[tuple[str, str]]) -> str:
    """Build a minimal dark-on-dark HTML email body."""
    row_html = "".join(
        f"""<tr>
          <td style="color:#71717a;padding:6px 0;font-size:13px;white-space:nowrap;
                     padding-right:24px">{label}</td>
          <td style="font-weight:600;font-size:13px;color:#e4e4e7">{value}</td>
        </tr>"""
        for label, value in rows
    )

    app_url = "https://predictalpha.online"

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
              max-width:480px;margin:32px auto;background:#18181b;
              border:1px solid rgba(255,255,255,0.08);border-radius:12px;
              padding:28px 32px;color:#e4e4e7">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <span style="font-size:22px">📈</span>
      <span style="font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.3px">
        Predict Alpha
      </span>
    </div>

    <!-- Badge -->
    <div style="display:inline-block;background:{badge_color};color:#fff;
                font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;
                border-radius:4px;padding:3px 10px;margin-bottom:20px">
      {badge_label}
    </div>

    <!-- Data table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      {row_html}
    </table>

    <!-- CTA -->
    <a href="{app_url}"
       style="display:inline-block;background:#22c55e;color:#fff;font-size:13px;
              font-weight:600;text-decoration:none;border-radius:6px;
              padding:10px 20px">
      View Dashboard →
    </a>

    <!-- Footer -->
    <p style="margin-top:24px;font-size:11px;color:#52525b">
      You're receiving this because email notifications are enabled for your
      Predict Alpha account.
      <a href="{app_url}" style="color:#52525b">Manage preferences</a>
    </p>
  </div>
</body>
</html>"""


def _fmt_price(price: float) -> str:
    if price >= 1_000:
        return f"${price:,.2f}"
    if price >= 1:
        return f"${price:.4f}"
    return f"${price:.6f}"


def _fmt_pnl(pnl_dollars: float, pnl_pct: float) -> str:
    sign = "+" if pnl_dollars >= 0 else ""
    color = "#22c55e" if pnl_dollars >= 0 else "#ef4444"
    return (
        f'<span style="color:{color};font-weight:700">'
        f"{sign}{pnl_dollars:,.2f} ({sign}{pnl_pct * 100:.2f}%)"
        f"</span>"
    )


def _fmt_ts(unix_seconds: int) -> str:
    dt = datetime.fromtimestamp(unix_seconds, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


# ─── Public template helpers ─────────────────────────────────────────────────


async def email_buy(
    to: str,
    strategy_name: str,
    ticker: str,
    timeframe: str,
    indicator: str,
    entry_price: float,
    qty: float,
    timestamp: int,
) -> None:
    subject = f"[Predict Alpha] {ticker} Buy Executed — {_fmt_price(entry_price)}"
    html = _html_wrapper(
        badge_color="#22c55e",
        badge_label="Buy Executed",
        rows=[
            ("Strategy",   strategy_name or "—"),
            ("Ticker",     ticker),
            ("Indicator",  indicator.upper()),
            ("Timeframe",  timeframe),
            ("Entry Price", _fmt_price(entry_price)),
            ("Quantity",   f"{qty:g}"),
            ("Time",       _fmt_ts(timestamp)),
        ],
    )
    await send_email(to, subject, html)


async def email_sell(
    to: str,
    strategy_name: str,
    ticker: str,
    timeframe: str,
    indicator: str,
    exit_price: float,
    qty: float,
    pnl_dollars: float,
    pnl_pct: float,
    timestamp: int,
) -> None:
    sign = "+" if pnl_pct >= 0 else ""
    subject = (
        f"[Predict Alpha] {ticker} Sell "
        f"{sign}{pnl_pct * 100:.2f}% — {strategy_name or 'Strategy'}"
    )
    html = _html_wrapper(
        badge_color="#ef4444",
        badge_label="Sell Executed",
        rows=[
            ("Strategy",   strategy_name or "—"),
            ("Ticker",     ticker),
            ("Indicator",  indicator.upper()),
            ("Timeframe",  timeframe),
            ("Exit Price", _fmt_price(exit_price)),
            ("Quantity",   f"{qty:g}"),
            ("P&L",        _fmt_pnl(pnl_dollars, pnl_pct)),
            ("Time",       _fmt_ts(timestamp)),
        ],
    )
    await send_email(to, subject, html)


async def email_trailing_stop(
    to: str,
    strategy_name: str,
    ticker: str,
    stop_level: float,
    qty: float,
    pnl_dollars: float,
    pnl_pct: float,
    timestamp: int,
) -> None:
    sign = "+" if pnl_pct >= 0 else ""
    subject = (
        f"[Predict Alpha] Trailing Stop Triggered — {ticker} "
        f"{sign}{pnl_pct * 100:.2f}%"
    )
    html = _html_wrapper(
        badge_color="#f59e0b",
        badge_label="Trailing Stop Triggered",
        rows=[
            ("Strategy",    strategy_name or "—"),
            ("Ticker",      ticker),
            ("Stop Level",  _fmt_price(stop_level)),
            ("Quantity",    f"{qty:g}"),
            ("P&L",         _fmt_pnl(pnl_dollars, pnl_pct)),
            ("Time",        _fmt_ts(timestamp)),
        ],
    )
    await send_email(to, subject, html)


async def email_signal(
    to: str,
    strategy_name: str,
    ticker: str,
    timeframe: str,
    indicator: str,
    direction: str,   # "entry" or "sell"
    price: float,
    timestamp: int,
) -> None:
    label = "BUY Signal" if direction == "entry" else "SELL Signal"
    badge_color = "#22c55e" if direction == "entry" else "#ef4444"
    subject = f"[Predict Alpha] Signal Alert: {indicator.upper()} {label} on {ticker}"
    html = _html_wrapper(
        badge_color=badge_color,
        badge_label=f"Signal Alert — {label}",
        rows=[
            ("Strategy",  strategy_name or "—"),
            ("Ticker",    ticker),
            ("Indicator", indicator.upper()),
            ("Timeframe", timeframe),
            ("Signal",    label),
            ("Price",     _fmt_price(price)),
            ("Time",      _fmt_ts(timestamp)),
            ("Auto-Trade", "OFF — manual action required"),
        ],
    )
    await send_email(to, subject, html)


# ─── Convenience: fire-and-forget wrapper ────────────────────────────────────

def fire_email(coro) -> None:
    """
    Schedule an email coroutine as a background task.
    Safe to call from async context — uses asyncio.create_task.
    Never raises even if there is no running loop.
    """
    try:
        asyncio.create_task(coro)
    except RuntimeError:
        # No running event loop (unit tests, etc.) — run synchronously
        try:
            asyncio.get_event_loop().run_until_complete(coro)
        except Exception as exc:
            logger.warning("fire_email_fallback_failed", error=str(exc))
