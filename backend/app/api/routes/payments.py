"""
Stripe Webhook Handler
──────────────────────
POST /webhook/stripe

Receives signed events from Stripe and syncs subscription status to Firestore.

Firestore path written: users/{uid}/billing/subscription

Events handled:
  checkout.session.completed       → activates "basic" plan
  customer.subscription.deleted    → reverts to "free"
  customer.subscription.paused     → reverts to "free"

Setup (one-time per environment):
  1. Stripe Dashboard → Developers → Webhooks → Add endpoint
     URL:    https://<your-cloud-run-url>/webhook/stripe
     Events: checkout.session.completed
             customer.subscription.deleted
             customer.subscription.paused
  2. Copy the "Signing secret" → add to backend/.env as STRIPE_WEBHOOK_SECRET
  3. Add your Stripe secret key as STRIPE_SECRET_KEY
"""

from __future__ import annotations

import asyncio

import stripe
from fastapi import APIRouter, HTTPException, Request
from firebase_admin import auth as firebase_auth

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.firestore_service import (
    clear_subscription,
    save_subscription,
    _db,
)

logger = get_logger(__name__)
router = APIRouter(tags=["payments"])


# ─── Helper: resolve Firebase UID from Stripe data ────────────────────────────

async def _resolve_uid(email: str | None, customer_id: str | None) -> str | None:
    """
    Look up the Firebase UID using the customer's email.
    Falls back to checking metadata on the Stripe Customer object.
    """
    settings = get_settings()

    # Primary: look up by email (matches Firebase Auth email)
    if email:
        try:
            user = await asyncio.to_thread(firebase_auth.get_user_by_email, email)
            return user.uid
        except firebase_auth.UserNotFoundError:
            logger.warning("stripe_user_not_found_by_email", email=email)
        except Exception as exc:
            logger.warning("stripe_firebase_lookup_error", email=email, error=str(exc))

    # Fallback: retrieve Stripe Customer and check metadata or email there
    if customer_id:
        try:
            stripe.api_key = settings.stripe_secret_key
            customer = await asyncio.to_thread(stripe.Customer.retrieve, customer_id)
            # Check if we stored firebase_uid in Stripe customer metadata
            uid = (customer.get("metadata") or {}).get("firebase_uid")
            if uid:
                return uid
            # Try the email stored on the Customer record itself
            cust_email = customer.get("email")
            if cust_email and cust_email != email:
                try:
                    user = await asyncio.to_thread(
                        firebase_auth.get_user_by_email, cust_email
                    )
                    return user.uid
                except firebase_auth.UserNotFoundError:
                    logger.warning("stripe_user_not_found_by_customer_email", email=cust_email)
        except Exception as exc:
            logger.warning(
                "stripe_customer_lookup_failed", customer_id=customer_id, error=str(exc)
            )

    return None


# ─── Event handlers ───────────────────────────────────────────────────────────

async def _handle_checkout_completed(session: dict) -> None:
    """Activate the user's subscription after a successful Stripe checkout."""
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key

    # Stripe always populates customer_details.email after checkout
    customer_details = session.get("customer_details") or {}
    email = customer_details.get("email") or session.get("customer_email")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    uid = await _resolve_uid(email, customer_id)
    if not uid:
        logger.error(
            "stripe_checkout_uid_unresolvable",
            email=email,
            customer=customer_id,
            session_id=session.get("id"),
        )
        return

    # Plan is "basic" by default for this Payment Link.
    # To support multiple plans, set metadata.plan on the Payment Link in Stripe
    # Dashboard → Payment Links → edit → Advanced → Metadata → plan=executive
    plan = (session.get("metadata") or {}).get("plan", "basic")

    await save_subscription(
        uid=uid,
        plan=plan,
        status="active",
        stripe_customer_id=customer_id or "",
        stripe_subscription_id=subscription_id or "",
    )
    logger.info("stripe_subscription_activated", uid=uid, plan=plan, customer=customer_id)


async def _handle_subscription_ended(subscription: dict) -> None:
    """Revert the user to the free plan when their subscription is cancelled/paused."""
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key

    customer_id = subscription.get("customer")
    uid = await _resolve_uid(None, customer_id)
    if not uid:
        logger.error(
            "stripe_sub_ended_uid_unresolvable",
            customer=customer_id,
            subscription_id=subscription.get("id"),
        )
        return

    await clear_subscription(uid)
    logger.info("stripe_subscription_ended", uid=uid, customer=customer_id)


# ─── Webhook endpoint ─────────────────────────────────────────────────────────

@router.post("/webhook/stripe", status_code=200)
async def stripe_webhook(request: Request) -> dict:
    """
    Stripe posts signed events here. IMPORTANT: raw body must be read before
    any JSON parsing — Stripe's signature check uses the exact bytes received.
    """
    settings = get_settings()

    if not settings.stripe_webhook_secret:
        logger.error("stripe_webhook_secret_not_configured")
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured")

    # Read raw bytes — required for signature verification
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # ── Verify Stripe signature ───────────────────────────────────────────────
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except ValueError:
        logger.warning("stripe_webhook_invalid_payload")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        logger.warning("stripe_webhook_invalid_signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type: str = event.get("type", "")
    event_data: dict = event["data"]["object"]

    logger.info("stripe_event_received", type=event_type, id=event.get("id"))

    # ── Route to handlers ─────────────────────────────────────────────────────
    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(event_data)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        await _handle_subscription_ended(event_data)

    else:
        logger.debug("stripe_event_ignored", type=event_type)

    return {"status": "ok"}


# ─── Cancel subscription endpoint ─────────────────────────────────────────────

@router.post("/api/v1/billing/cancel-subscription", status_code=503)
async def cancel_subscription(request: Request) -> dict:
    """Disabled during demo/beta — subscription management is not available yet."""
    raise HTTPException(
        status_code=503,
        detail="Subscription management is not available during the beta period. Please contact support.",
    )
