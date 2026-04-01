"""
Firestore Service — server-side Firebase Admin SDK wrapper
──────────────────────────────────────────────────────────
Provides async helpers for reading strategy configs, Alpaca credentials,
and writing trade records on behalf of users.

SETUP (one-time):
  1. Firebase Console → Project Settings → Service Accounts
  2. "Generate new private key" → save as  backend/service-account.json
  3. Add to backend/.env:
       GOOGLE_APPLICATION_CREDENTIALS=service-account.json

FIRESTORE INDEXES REQUIRED (collection group queries):
  Collection group : strategies
  Fields           : autoTrade  (Ascending)
  Scope            : Collection group

  Create at:
  https://console.firebase.google.com/project/<YOUR_PROJECT_ID>/firestore/indexes
  → Add index → Collection group "strategies" → Field "autoTrade" ASC → Collection group scope

  Two entries are needed:
    1. autoTrade == True  (auto-execution loop)
    2. autoTrade == False (signal-watch / notification-only loop)
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore_async
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Initialise Firebase Admin SDK (once per process) ────────────────────────

_app: firebase_admin.App | None = None


def init_firebase() -> bool:
    """
    Initialise the Firebase Admin SDK.
    Returns True on success, False if no credentials are available.
    Called once at server startup.

    Authentication priority:
      1. Service account JSON file — path from GOOGLE_APPLICATION_CREDENTIALS env var
         (or default "service-account.json").  Use this for local development.
      2. Application Default Credentials (ADC) — used automatically on Cloud Run,
         GCE, GKE, and any other GCP-hosted environment.  No file or env var needed;
         just grant the Cloud Run service account the required Firebase/Firestore roles.

    Cloud Run setup (one-time, no secrets file required):
      gcloud projects add-iam-policy-binding predict-alpha-4ed0c \\
        --member="serviceAccount:<CLOUD_RUN_SA>@predict-alpha-4ed0c.iam.gserviceaccount.com" \\
        --role="roles/datastore.user"
      # Also grant roles/firebase.admin if you need Auth / Storage admin access.
    """
    global _app
    if _app is not None:
        return True  # Already initialised

    # ── Strategy 1: explicit service account JSON file (local dev) ────────────
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    # Resolve relative to the backend/ directory
    if not os.path.isabs(cred_path):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        cred_path = os.path.join(backend_dir, cred_path)

    if os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            _app = firebase_admin.initialize_app(cred)
            logger.info("firebase_admin_initialized", credential_path=cred_path)
            return True
        except Exception as exc:
            logger.error("firebase_admin_init_failed_file", path=cred_path, error=str(exc))
            return False

    # ── Strategy 2: Application Default Credentials (Cloud Run / GCP) ─────────
    # On Cloud Run the runtime service account is used automatically.
    # No GOOGLE_APPLICATION_CREDENTIALS file is needed — just IAM role assignment.
    logger.info(
        "firebase_credentials_file_not_found",
        path=cred_path,
        fallback="Attempting Application Default Credentials (ADC)",
    )
    try:
        _app = firebase_admin.initialize_app()  # ADC: picks up GCP metadata server
        logger.info("firebase_admin_initialized_adc")
        return True
    except Exception as exc:
        logger.warning(
            "firebase_adc_failed",
            error=str(exc),
            hint=(
                "For local dev: download a service account JSON from Firebase Console → "
                "Project Settings → Service Accounts and place it at backend/service-account.json. "
                "On Cloud Run: grant the runtime service account roles/datastore.user."
            ),
        )
        return False


def _db():
    """Return the async Firestore client. Raises if Firebase is not initialised."""
    if _app is None:
        raise RuntimeError("Firebase Admin SDK not initialised — call init_firebase() first.")
    return firestore_async.client()


# ─── Strategy queries ─────────────────────────────────────────────────────────

async def get_active_strategies() -> list[tuple[str, dict[str, Any]]]:
    """
    Return a list of (uid, strategy_dict) for all strategies with autoTrade=True.

    Requires a Firestore collection-group index on strategies.autoTrade.
    If the index is missing Firestore raises a 9 / FAILED_PRECONDITION error
    with a URL to create the index — that URL is logged automatically.
    """
    db = _db()
    results: list[tuple[str, dict[str, Any]]] = []
    try:
        query = (
            db.collection_group("strategies")
            .where(filter=firestore_async.firestore.FieldFilter("autoTrade", "==", True))
        )
        async for doc in query.stream():
            # Path: users/{uid}/strategies/{strategyId}
            path_parts = doc.reference.path.split("/")
            if len(path_parts) >= 4 and path_parts[0] == "users":
                uid = path_parts[1]
                data = doc.to_dict() or {}
                data["id"] = doc.id
                results.append((uid, data))
                logger.debug("firestore_strategy_loaded", uid=uid, strategy_id=doc.id, data=data)
    except Exception as exc:
        err_msg = str(exc)
        if "index" in err_msg.lower() or "FAILED_PRECONDITION" in err_msg:
            logger.error(
                "firestore_index_missing",
                hint=(
                    "Create a collection-group index for 'strategies.autoTrade' at "
                    "https://console.firebase.google.com → Firestore → Indexes"
                ),
                error=err_msg,
            )
        else:
            logger.error("get_active_strategies_failed", error=err_msg)
    return results


# ─── Alpaca key lookup (with simple in-process LRU cache) ────────────────────

_key_cache: dict[str, tuple[float, dict[str, str]]] = {}
_KEY_CACHE_TTL = 300  # seconds


async def get_alpaca_keys(uid: str) -> dict[str, str]:
    """
    Return {"paperApiKey": ..., "paperSecretKey": ...} for the given user.
    Result is cached for 5 minutes to avoid hammering Firestore on every poll.
    Returns an empty dict if keys are not stored.
    """
    now = time.monotonic()
    if uid in _key_cache:
        ts, cached = _key_cache[uid]
        if now - ts < _KEY_CACHE_TTL:
            return cached

    db = _db()
    try:
        snap = await db.document(f"users/{uid}/private/alpacaKeys").get()
        if snap.exists:
            data = snap.to_dict() or {}
            keys = {
                "paperApiKey":    data.get("paperApiKey", ""),
                "paperSecretKey": data.get("paperSecretKey", ""),
                "liveApiKey":     data.get("liveApiKey", ""),
                "liveSecretKey":  data.get("liveSecretKey", ""),
            }
        else:
            keys = {}
        _key_cache[uid] = (now, keys)
        return keys
    except Exception as exc:
        logger.warning("get_alpaca_keys_failed", uid=uid, error=str(exc))
        return {}


def invalidate_key_cache(uid: str) -> None:
    _key_cache.pop(uid, None)


# ─── Broker account ───────────────────────────────────────────────────────────

async def save_broker_account(uid: str, alpaca_account_id: str, status: str) -> None:
    """
    Persist the Alpaca Broker account ID and status under users/{uid}/broker/account.
    Called after POST /v1/accounts succeeds.
    """
    db = _db()
    try:
        ref = db.document(f"users/{uid}/broker/account")
        now_ms = int(time.time() * 1000)
        await ref.set(
            {
                "alpacaAccountId": alpaca_account_id,
                "status": status,
                "updatedAt": now_ms,
                "createdAt": now_ms,
            },
            merge=True,
        )
        logger.info("broker_account_saved", uid=uid, account_id=alpaca_account_id, status=status)
    except Exception as exc:
        logger.error("save_broker_account_failed", uid=uid, error=str(exc))
        raise


async def update_broker_account_status(uid: str, status: str) -> None:
    """Update just the status field (called when polling for KYC completion)."""
    db = _db()
    try:
        ref = db.document(f"users/{uid}/broker/account")
        await ref.set({"status": status, "updatedAt": int(time.time() * 1000)}, merge=True)
    except Exception as exc:
        logger.error("update_broker_status_failed", uid=uid, error=str(exc))
        raise


_broker_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_BROKER_CACHE_TTL = 10  # seconds — short TTL since status changes during KYC


async def get_broker_account(uid: str, *, bypass_cache: bool = False) -> dict[str, Any]:
    """
    Return {"alpacaAccountId": ..., "status": ..., ...} for the user.
    Returns an empty dict if no broker account has been created yet.
    """
    now = time.monotonic()
    if not bypass_cache and uid in _broker_cache:
        ts, cached = _broker_cache[uid]
        if now - ts < _BROKER_CACHE_TTL:
            return cached

    db = _db()
    try:
        snap = await db.document(f"users/{uid}/broker/account").get()
        data = snap.to_dict() if snap.exists else {}
        _broker_cache[uid] = (now, data)
        return data
    except Exception as exc:
        logger.warning("get_broker_account_failed", uid=uid, error=str(exc))
        return {}


def invalidate_broker_cache(uid: str) -> None:
    _broker_cache.pop(uid, None)


# ─── Subscription management (Stripe) ────────────────────────────────────────

async def save_subscription(
    uid: str,
    plan: str,
    status: str,
    stripe_customer_id: str,
    stripe_subscription_id: str,
) -> None:
    """
    Write subscription details to users/{uid}/billing/subscription.
    Called by the Stripe webhook on checkout.session.completed.
    """
    db = _db()
    try:
        ref = db.document(f"users/{uid}/billing/subscription")
        await ref.set(
            {
                "plan": plan,
                "status": status,
                "stripeCustomerId": stripe_customer_id,
                "stripeSubscriptionId": stripe_subscription_id,
                "activatedAt": int(time.time() * 1000),
                "updatedAt": int(time.time() * 1000),
            },
            merge=True,
        )
        logger.info("subscription_saved", uid=uid, plan=plan, status=status)
    except Exception as exc:
        logger.error("save_subscription_failed", uid=uid, error=str(exc))
        raise


async def clear_subscription(uid: str) -> None:
    """
    Mark subscription as cancelled when Stripe fires subscription.deleted.
    Keeps the record but sets status=cancelled and plan=free.
    """
    db = _db()
    try:
        ref = db.document(f"users/{uid}/billing/subscription")
        await ref.set(
            {
                "plan": "free",
                "status": "cancelled",
                "cancelledAt": int(time.time() * 1000),
                "updatedAt": int(time.time() * 1000),
            },
            merge=True,
        )
        logger.info("subscription_cleared", uid=uid)
    except Exception as exc:
        logger.error("clear_subscription_failed", uid=uid, error=str(exc))
        raise


# ─── Strategy mutations ───────────────────────────────────────────────────────

async def update_strategy(uid: str, strategy_id: str, patch: dict[str, Any]) -> None:
    """Merge-patch a strategy document."""
    db = _db()
    try:
        ref = db.document(f"users/{uid}/strategies/{strategy_id}")
        patch["updatedAt"] = int(time.time() * 1000)  # Unix ms, same as client
        await ref.set(patch, merge=True)
    except Exception as exc:
        logger.error(
            "update_strategy_failed",
            uid=uid, strategy_id=strategy_id, error=str(exc),
        )


# ─── Trade record writes ──────────────────────────────────────────────────────

async def get_signal_watch_strategies() -> list[tuple[str, dict[str, Any]]]:
    """
    Return a list of (uid, strategy_dict) for strategies with autoTrade=False
    that belong to users who have emailOnSignal enabled.

    Used to send signal-alert emails without placing actual orders.
    Requires the same Firestore collection-group index as get_active_strategies()
    but for autoTrade == False.
    """
    db = _db()
    results: list[tuple[str, dict[str, Any]]] = []
    try:
        query = (
            db.collection_group("strategies")
            .where(filter=firestore_async.firestore.FieldFilter("autoTrade", "==", False))
        )
        async for doc in query.stream():
            path_parts = doc.reference.path.split("/")
            if len(path_parts) >= 4 and path_parts[0] == "users":
                uid = path_parts[1]
                data = doc.to_dict() or {}
                data["id"] = doc.id
                results.append((uid, data))
    except Exception as exc:
        logger.warning("get_signal_watch_strategies_failed", error=str(exc))
    return results


# ─── User profile helpers ─────────────────────────────────────────────────────

async def get_user_email(uid: str) -> str | None:
    """
    Read the email field from users/{uid}.
    Uses field_paths to avoid fetching the entire document.
    Returns None if the document or field is missing.
    """
    db = _db()
    try:
        snap = await db.document(f"users/{uid}").get(field_paths=["email"])
        if snap.exists:
            return (snap.to_dict() or {}).get("email")
    except Exception as exc:
        logger.warning("get_user_email_failed", uid=uid, error=str(exc))
    return None


# ─── Notification preference helpers ─────────────────────────────────────────

_notif_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_NOTIF_CACHE_TTL = 120  # seconds

_NOTIF_DEFAULTS: dict[str, Any] = {
    "emailEnabled":        False,
    "emailOnBuy":          True,
    "emailOnSell":         True,
    "emailOnTrailingStop": True,
    "emailOnSignal":       True,
}


async def get_notification_prefs(uid: str) -> dict[str, Any]:
    """
    Read users/{uid}/settings/notifications.
    Result is cached for 120 s.
    Returns safe defaults (emailEnabled=False) if the document is missing.
    """
    now = time.monotonic()
    if uid in _notif_cache:
        ts, cached = _notif_cache[uid]
        if now - ts < _NOTIF_CACHE_TTL:
            return cached

    db = _db()
    try:
        snap = await db.document(f"users/{uid}/settings/notifications").get()
        data = {**_NOTIF_DEFAULTS, **(snap.to_dict() or {})} if snap.exists else {**_NOTIF_DEFAULTS}
    except Exception as exc:
        logger.warning("get_notification_prefs_failed", uid=uid, error=str(exc))
        data = {**_NOTIF_DEFAULTS}

    _notif_cache[uid] = (now, data)
    return data


async def save_notification_prefs(uid: str, prefs: dict[str, Any]) -> None:
    """
    Write (merge) notification preferences to users/{uid}/settings/notifications.
    Invalidates the in-process cache for this user.
    """
    db = _db()
    try:
        ref = db.document(f"users/{uid}/settings/notifications")
        await ref.set(prefs, merge=True)
        _notif_cache.pop(uid, None)
        logger.info("notification_prefs_saved", uid=uid)
    except Exception as exc:
        logger.error("save_notification_prefs_failed", uid=uid, error=str(exc))
        raise


async def add_trade(uid: str, trade: dict[str, Any]) -> str:
    """
    Write a TradeRecord to users/{uid}/trades/{auto_id}.
    Returns the new document ID.
    Matches the schema in src/types/trade.ts.
    """
    db = _db()
    trade_id = str(uuid.uuid4())
    try:
        ref = db.document(f"users/{uid}/trades/{trade_id}")
        trade["id"] = trade_id
        trade["createdAt"] = trade.get("createdAt", int(time.time() * 1000))
        await ref.set(trade)
        logger.info(
            "trade_recorded",
            uid=uid,
            trade_id=trade_id,
            ticker=trade.get("ticker"),
            pnl=trade.get("pnlDollars"),
        )
    except Exception as exc:
        logger.error("add_trade_failed", uid=uid, error=str(exc))
    return trade_id
