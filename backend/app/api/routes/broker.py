"""
Broker API Routes — manages end-user accounts via Alpaca Broker API.
────────────────────────────────────────────────────────────────────
All routes use the server-side BrokerClient (HTTP Basic auth).
The Firebase UID is passed as the X-User-Id header to identify
which Firestore document to read/write the alpacaAccountId from.

Routes:
  POST   /api/v1/broker/accounts                           — create account (KYC)
  GET    /api/v1/broker/accounts/{uid}                     — get account + status
  GET    /api/v1/broker/accounts/{uid}/ach                 — list ACH relationships
  POST   /api/v1/broker/accounts/{uid}/ach                 — create ACH relationship
  DELETE /api/v1/broker/accounts/{uid}/ach/{rel_id}        — remove ACH relationship
  GET    /api/v1/broker/accounts/{uid}/transfers           — list transfers
  POST   /api/v1/broker/accounts/{uid}/transfers           — initiate a transfer
  GET    /api/v1/broker/accounts/{uid}/positions           — open positions
  GET    /api/v1/broker/accounts/{uid}/orders              — list orders
  POST   /api/v1/broker/accounts/{uid}/orders              — place order
  DELETE /api/v1/broker/accounts/{uid}/orders/{order_id}   — cancel order
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Header, HTTPException, Path, Query, Response, status
from pydantic import BaseModel, Field, EmailStr

from app.core.logging import get_logger
from app.services.broker_client import get_broker_client
from app.services.firestore_service import (
    get_broker_account,
    save_broker_account,
    update_broker_account_status,
    invalidate_broker_cache,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/broker", tags=["broker"])


# ─── Helper: resolve alpacaAccountId from Firestore ──────────────────────────

async def _resolve_account_id(uid: str) -> str:
    data = await get_broker_account(uid)
    account_id = data.get("alpacaAccountId")
    if not account_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No broker account found for this user. Complete onboarding first.",
        )
    return account_id


# ─── Request / Response models ────────────────────────────────────────────────

class IdentityRequest(BaseModel):
    given_name: str
    middle_name: str | None = None
    family_name: str
    date_of_birth: date  # YYYY-MM-DD
    tax_id: str
    tax_id_type: str = "USA_SSN"
    country_of_citizenship: str = "USA"
    country_of_birth: str = "USA"
    country_of_tax_residence: str = "USA"
    funding_source: list[str] = Field(default_factory=lambda: ["employment_income"])


class ContactRequest(BaseModel):
    email_address: str
    phone_number: str
    street_address: list[str]
    city: str
    state: str  # 2-letter US state code e.g. "CA"
    postal_code: str
    country: str = "USA"


class DisclosuresRequest(BaseModel):
    is_control_person: bool = False
    is_affiliated_exchange_or_finra: bool = False
    is_politically_exposed: bool = False
    immediate_family_exposed: bool = False


class AgreementRequest(BaseModel):
    agreement: Literal["customer_agreement", "account_agreement", "margin_agreement"]
    signed_at: str  # ISO 8601 datetime string
    ip_address: str


class TrustedContactRequest(BaseModel):
    given_name: str
    family_name: str
    email_address: str | None = None
    phone_number: str | None = None


class CreateAccountRequest(BaseModel):
    identity: IdentityRequest
    contact: ContactRequest
    disclosures: DisclosuresRequest
    agreements: list[AgreementRequest]
    trusted_contact: TrustedContactRequest | None = None


class BrokerAccountResponse(BaseModel):
    alpacaAccountId: str
    status: str
    currency: str | None = None
    buying_power: str | None = None
    equity: str | None = None
    cash: str | None = None
    created_at: str | None = None


class ACHRelationshipRequest(BaseModel):
    account_owner_name: str
    bank_account_type: Literal["CHECKING", "SAVINGS"]
    bank_account_number: str
    bank_routing_number: str
    nickname: str | None = None


class TransferRequest(BaseModel):
    transfer_type: Literal["ach"] = "ach"
    relationship_id: str
    amount: str  # string decimal e.g. "1000.00"
    direction: Literal["INCOMING", "OUTGOING"]
    timing: Literal["immediate"] = "immediate"


class PlaceBrokerOrderRequest(BaseModel):
    symbol: str
    qty: float | None = None
    notional: float | None = None
    side: Literal["buy", "sell"]
    type: Literal["market", "limit", "stop", "stop_limit"] = "market"
    time_in_force: Literal["day", "gtc", "ioc", "fok"] = "day"
    limit_price: float | None = None
    stop_price: float | None = None
    strategy_id: str | None = None


# ─── Account routes ───────────────────────────────────────────────────────────

@router.post(
    "/accounts",
    status_code=201,
    summary="Create a broker account for an end user (KYC submission)",
)
async def create_account(
    req: CreateAccountRequest,
    x_user_id: str = Header(..., alias="X-User-Id"),
) -> dict[str, Any]:
    """
    Submit KYC information to Alpaca to open a trading account for the user.
    Alpaca runs automated verification; account status starts as SUBMITTED
    and progresses to ACTIVE once cleared.
    """
    client = get_broker_client()

    payload: dict[str, Any] = {
        "identity": {
            "given_name": req.identity.given_name,
            "family_name": req.identity.family_name,
            "date_of_birth": req.identity.date_of_birth.isoformat(),
            "tax_id": req.identity.tax_id,
            "tax_id_type": req.identity.tax_id_type,
            "country_of_citizenship": req.identity.country_of_citizenship,
            "country_of_birth": req.identity.country_of_birth,
            "country_of_tax_residence": req.identity.country_of_tax_residence,
            "funding_source": req.identity.funding_source,
        },
        "contact": {
            "email_address": req.contact.email_address,
            "phone_number": req.contact.phone_number,
            "street_address": req.contact.street_address,
            "city": req.contact.city,
            "state": req.contact.state,
            "postal_code": req.contact.postal_code,
            "country": req.contact.country,
        },
        "disclosures": {
            "is_control_person": req.disclosures.is_control_person,
            "is_affiliated_exchange_or_finra": req.disclosures.is_affiliated_exchange_or_finra,
            "is_politically_exposed": req.disclosures.is_politically_exposed,
            "immediate_family_exposed": req.disclosures.immediate_family_exposed,
        },
        "agreements": [
            {
                "agreement": a.agreement,
                "signed_at": a.signed_at,
                "ip_address": a.ip_address,
            }
            for a in req.agreements
        ],
    }
    if req.identity.middle_name:
        payload["identity"]["middle_name"] = req.identity.middle_name

    if req.trusted_contact:
        payload["trusted_contact"] = {
            "given_name": req.trusted_contact.given_name,
            "family_name": req.trusted_contact.family_name,
        }
        if req.trusted_contact.email_address:
            payload["trusted_contact"]["email_address"] = req.trusted_contact.email_address
        if req.trusted_contact.phone_number:
            payload["trusted_contact"]["phone_number"] = req.trusted_contact.phone_number

    result = await client.create_account(payload)
    account_id = result["id"]
    account_status = result.get("status", "SUBMITTED")

    await save_broker_account(x_user_id, account_id, account_status)

    logger.info(
        "broker_account_onboarded",
        uid=x_user_id,
        account_id=account_id,
        status=account_status,
    )
    return {"alpacaAccountId": account_id, "status": account_status}


@router.get(
    "/accounts/{uid}",
    summary="Get broker account status and details",
)
async def get_account(uid: str = Path(...)) -> dict[str, Any]:
    """
    Fetch the latest account info from Alpaca and sync status to Firestore.
    Used by the frontend to poll for KYC approval (SUBMITTED → ACTIVE).
    """
    client = get_broker_client()
    fs_data = await get_broker_account(uid, bypass_cache=True)
    account_id = fs_data.get("alpacaAccountId")

    if not account_id:
        return {"status": "NOT_CREATED", "alpacaAccountId": None}

    alpaca_data = await client.get_account(account_id)
    new_status = alpaca_data.get("status", fs_data.get("status", "SUBMITTED"))

    if new_status != fs_data.get("status"):
        await update_broker_account_status(uid, new_status)
        invalidate_broker_cache(uid)

    return {
        "alpacaAccountId": account_id,
        "status": new_status,
        "currency": alpaca_data.get("currency"),
        "created_at": alpaca_data.get("created_at"),
    }


@router.get(
    "/accounts/{uid}/trading",
    summary="Get broker trading account (buying power, equity, cash)",
)
async def get_trading_account(uid: str = Path(...)) -> dict[str, Any]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    data = await client.get_trading_account(account_id)
    return {
        "buying_power": data.get("buying_power"),
        "equity": data.get("equity"),
        "cash": data.get("cash"),
        "long_market_value": data.get("long_market_value"),
        "short_market_value": data.get("short_market_value"),
        "portfolio_value": data.get("portfolio_value"),
        "pattern_day_trader": data.get("pattern_day_trader", False),
        "trading_blocked": data.get("trading_blocked", False),
        "daytrade_count": data.get("daytrade_count", 0),
    }


# ─── ACH Relationship routes ──────────────────────────────────────────────────

@router.get(
    "/accounts/{uid}/ach",
    summary="List ACH bank relationships for this user",
)
async def list_ach(uid: str = Path(...)) -> list[dict[str, Any]]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    return await client.list_ach_relationships(account_id)


@router.post(
    "/accounts/{uid}/ach",
    status_code=201,
    summary="Add a bank account (ACH relationship)",
)
async def create_ach(
    uid: str,
    req: ACHRelationshipRequest,
) -> dict[str, Any]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    payload: dict[str, Any] = {
        "account_owner_name": req.account_owner_name,
        "bank_account_type": req.bank_account_type,
        "bank_account_number": req.bank_account_number,
        "bank_routing_number": req.bank_routing_number,
    }
    if req.nickname:
        payload["nickname"] = req.nickname
    return await client.create_ach_relationship(account_id, payload)


@router.delete(
    "/accounts/{uid}/ach/{relationship_id}",
    status_code=204,
    response_class=Response,
    summary="Remove a bank account (ACH relationship)",
)
async def delete_ach(uid: str, relationship_id: str) -> Response:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    await client.delete_ach_relationship(account_id, relationship_id)
    return Response(status_code=204)


# ─── Transfer routes ──────────────────────────────────────────────────────────

@router.get(
    "/accounts/{uid}/transfers",
    summary="List fund transfers for this user",
)
async def list_transfers(uid: str = Path(...)) -> list[dict[str, Any]]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    return await client.list_transfers(account_id)


@router.post(
    "/accounts/{uid}/transfers",
    status_code=201,
    summary="Initiate an ACH deposit or withdrawal",
)
async def create_transfer(uid: str, req: TransferRequest) -> dict[str, Any]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    payload: dict[str, Any] = {
        "transfer_type": req.transfer_type,
        "relationship_id": req.relationship_id,
        "amount": req.amount,
        "direction": req.direction,
        "timing": req.timing,
    }
    return await client.create_transfer(account_id, payload)


# ─── Position routes ──────────────────────────────────────────────────────────

@router.get(
    "/accounts/{uid}/positions",
    summary="List open positions for this user",
)
async def get_positions(uid: str = Path(...)) -> list[dict[str, Any]]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    return await client.get_positions(account_id)


# ─── Order routes ─────────────────────────────────────────────────────────────

@router.get(
    "/accounts/{uid}/orders",
    summary="List orders for this user",
)
async def get_orders(
    uid: str = Path(...),
    limit: int = Query(default=25, ge=1, le=500),
    order_status: str = Query(default="all", alias="status"),
) -> list[dict[str, Any]]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    return await client.get_orders(account_id, limit=limit, order_status=order_status)


@router.post(
    "/accounts/{uid}/orders",
    status_code=201,
    summary="Place an order on behalf of the user",
)
async def place_order(uid: str, req: PlaceBrokerOrderRequest) -> dict[str, Any]:
    from app.services.firestore_service import add_trade

    client = get_broker_client()
    account_id = await _resolve_account_id(uid)

    body: dict[str, Any] = {
        "symbol": req.symbol,
        "side": req.side,
        "type": req.type,
        "time_in_force": req.time_in_force,
    }
    if req.qty is not None:
        body["qty"] = str(req.qty)
    if req.notional is not None:
        body["notional"] = str(req.notional)
    if req.limit_price is not None:
        body["limit_price"] = str(req.limit_price)
    if req.stop_price is not None:
        body["stop_price"] = str(req.stop_price)

    result = await client.place_order(account_id, body)

    # Record in Firestore trades collection
    await add_trade(uid, {
        "ticker": req.symbol,
        "side": req.side,
        "qty": req.qty or 0,
        "entryPrice": float(result.get("filled_avg_price") or 0),
        "exitPrice": 0.0,
        "pnlDollars": 0.0,
        "orderId": result.get("id"),
        "strategyId": req.strategy_id,
        "source": "broker",
    })

    return result


@router.delete(
    "/accounts/{uid}/orders/{order_id}",
    status_code=204,
    response_class=Response,
    summary="Cancel an order",
)
async def cancel_order(uid: str, order_id: str = Path(...)) -> Response:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    await client.cancel_order(account_id, order_id)
    return Response(status_code=204)


@router.delete(
    "/accounts/{uid}/orders",
    status_code=207,
    summary="Cancel all open orders",
)
async def cancel_all_orders(uid: str = Path(...)) -> list[dict[str, Any]]:
    client = get_broker_client()
    account_id = await _resolve_account_id(uid)
    return await client.cancel_all_orders(account_id)
