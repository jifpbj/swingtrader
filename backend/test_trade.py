#!/usr/bin/env python3
"""
test_trade.py — Hardcoded test: buy 1 SOL/USD on jeffffan@gmail.com's paper account.

Usage:
  cd backend
  python test_trade.py

Requires:
  - service-account.json in backend/
  - .env loaded (or env vars set)
  - firebase_admin, httpx, python-dotenv installed
"""

import asyncio
import os
import sys
from pathlib import Path

# ── Load .env ──────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # python-dotenv not installed; rely on environment

import httpx

# ── Firebase Admin ─────────────────────────────────────────────────────────────
import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials, firestore_async

TARGET_EMAIL = "jeffffan@gmail.com"
SYMBOL       = "SOLUSD"          # Alpaca crypto symbol (no slash)
QTY          = 1                  # 1 SOL
PAPER_URL    = "https://paper-api.alpaca.markets"

_firebase_app: firebase_admin.App | None = None


def _init_firebase() -> bool:
    global _firebase_app
    if _firebase_app is not None:
        return True
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not os.path.isabs(cred_path):
        cred_path = str(Path(__file__).parent / cred_path)
    if not os.path.exists(cred_path):
        print(f"[ERROR] service-account.json not found at {cred_path}")
        return False
    try:
        cred = credentials.Certificate(cred_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        print(f"[OK] Firebase initialized ({cred_path})")
        return True
    except Exception as e:
        print(f"[ERROR] Firebase init failed: {e}")
        return False


async def _get_uid_by_email(email: str) -> str | None:
    try:
        user = fb_auth.get_user_by_email(email)
        print(f"[OK] Found user: {user.uid} ({email})")
        return user.uid
    except fb_auth.UserNotFoundError:
        print(f"[ERROR] No Firebase user found for {email}")
        return None
    except Exception as e:
        print(f"[ERROR] get_user_by_email failed: {e}")
        return None


async def _get_alpaca_paper_keys(uid: str) -> tuple[str, str] | None:
    db = firestore_async.client()
    try:
        snap = await db.document(f"users/{uid}/private/alpacaKeys").get()
        if not snap.exists:
            print(f"[WARN] No Alpaca keys in Firestore for uid={uid} — falling back to .env keys")
            api_key    = os.environ.get("ALPACA_API_KEY", "")
            secret_key = os.environ.get("ALPACA_SECRET_KEY", "")
            if not api_key or not secret_key:
                print("[ERROR] No keys found in Firestore or .env")
                return None
            print(f"[OK] Using .env keys: {api_key[:8]}...")
            return api_key, secret_key

        data = snap.to_dict() or {}
        api_key    = data.get("paperApiKey", "")
        secret_key = data.get("paperSecretKey", "")
        if not api_key or not secret_key:
            print(f"[WARN] Firestore keys empty for uid={uid} — falling back to .env keys")
            api_key    = os.environ.get("ALPACA_API_KEY", "")
            secret_key = os.environ.get("ALPACA_SECRET_KEY", "")
            if not api_key or not secret_key:
                print("[ERROR] No fallback keys in .env either")
                return None

        print(f"[OK] Alpaca paper keys loaded (key={api_key[:8]}...)")
        return api_key, secret_key
    except Exception as e:
        print(f"[ERROR] Firestore key fetch failed: {e}")
        return None


async def _place_order(api_key: str, secret_key: str) -> dict | None:
    headers = {
        "APCA-API-KEY-ID":     api_key,
        "APCA-API-SECRET-KEY": secret_key,
    }
    body = {
        "symbol":        SYMBOL,
        "qty":           str(QTY),
        "side":          "buy",
        "type":          "market",
        "time_in_force": "gtc",
    }
    print(f"[>>] Placing market buy: qty={QTY} {SYMBOL} on {PAPER_URL} ...")
    async with httpx.AsyncClient(base_url=PAPER_URL, timeout=15.0) as client:
        try:
            resp = await client.post("/v2/orders", json=body, headers=headers)
            if resp.status_code >= 400:
                print(f"[ERROR] Alpaca returned {resp.status_code}: {resp.text}")
                return None
            order = resp.json()
            print(f"[OK] Order placed!")
            print(f"     id     : {order.get('id')}")
            print(f"     symbol : {order.get('symbol')}")
            print(f"     side   : {order.get('side')}")
            print(f"     qty    : {order.get('qty')}")
            print(f"     status : {order.get('status')}")
            print(f"     created: {order.get('created_at')}")
            return order
        except Exception as e:
            print(f"[ERROR] HTTP request failed: {e}")
            return None


async def main() -> None:
    print("=" * 60)
    print(f"  Test Trade — buy {QTY} {SYMBOL} for {TARGET_EMAIL}")
    print("=" * 60)

    if not _init_firebase():
        sys.exit(1)

    uid = await _get_uid_by_email(TARGET_EMAIL)
    if uid is None:
        sys.exit(1)

    keys = await _get_alpaca_paper_keys(uid)
    if keys is None:
        sys.exit(1)

    api_key, secret_key = keys
    order = await _place_order(api_key, secret_key)
    if order is None:
        print("\n[FAIL] Trade was NOT placed.")
        sys.exit(1)

    print("\n[PASS] Trade placed successfully.")


if __name__ == "__main__":
    asyncio.run(main())
