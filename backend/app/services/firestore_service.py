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

FIRESTORE INDEX REQUIRED (collection group query):
  Collection group : strategies
  Field            : autoTrade  (Ascending)
  Scope            : Collection group

  Create at:
  https://console.firebase.google.com/project/<YOUR_PROJECT_ID>/firestore/indexes
  → Add index → Collection group "strategies" → Field "autoTrade" ASC → Collection group scope
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
