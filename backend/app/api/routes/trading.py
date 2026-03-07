"""
Paper/Live Trading Routes — proxy to Alpaca trading API.

All endpoints require X-Alpaca-Key and X-Alpaca-Secret request headers.
X-Alpaca-Base-Url selects paper vs live Alpaca API (default: paper).
The backend acts as a transparent proxy so user credentials are never
stored server-side.
"""

from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, Header, HTTPException, Path, Query, Response, status
from pydantic import BaseModel

from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/trading", tags=["trading"])

ALPACA_PAPER_URL = "https://paper-api.alpaca.markets"
ALPACA_LIVE_URL  = "https://api.alpaca.markets"

# Allowed base URLs — reject anything else to prevent SSRF
_ALLOWED_BASE_URLS = {ALPACA_PAPER_URL, ALPACA_LIVE_URL}

# Per-base-url clients (connection pool reuse)
_clients: dict[str, httpx.AsyncClient] = {}


def _get_client(base_url: str) -> httpx.AsyncClient:
    if base_url not in _clients:
        _clients[base_url] = httpx.AsyncClient(base_url=base_url, timeout=15.0)
    return _clients[base_url]


def _headers(api_key: str, secret_key: str) -> dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret_key,
    }


async def _request(
    method: str,
    path: str,
    api_key: str,
    secret_key: str,
    base_url: str = ALPACA_PAPER_URL,
    **kwargs: Any,
) -> Any:
    """Proxy a request to Alpaca API, raising HTTPException on error."""
    if base_url not in _ALLOWED_BASE_URLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Alpaca base URL: {base_url}",
        )
    client = _get_client(base_url)
    resp = await client.request(
        method, path, headers=_headers(api_key, secret_key), **kwargs
    )

    if resp.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Alpaca API credentials.",
        )
    if resp.status_code == 403:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Alpaca account access forbidden.",
        )
    if resp.status_code == 422:
        body = resp.json() if resp.content else {}
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=body.get("message", "Alpaca rejected the request."),
        )
    if not resp.is_success:
        body = resp.json() if resp.content else {}
        msg = body.get("message", body.get("detail", str(resp.status_code)))
        raise HTTPException(status_code=resp.status_code, detail=f"Alpaca: {msg}")

    return resp.json() if resp.content else {}


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AlpacaAccount(BaseModel):
    id: str
    buying_power: float
    portfolio_value: float
    equity: float
    cash: float
    long_market_value: float
    short_market_value: float
    daytrade_count: int
    pattern_day_trader: bool
    trading_blocked: bool


class AlpacaPosition(BaseModel):
    symbol: str
    qty: float
    side: str
    avg_entry_price: float
    current_price: float | None = None
    unrealized_pl: float
    unrealized_plpc: float
    market_value: float | None = None


class AlpacaOrder(BaseModel):
    id: str
    symbol: str
    side: str
    qty: float | None = None
    notional: float | None = None
    order_type: str
    status: str
    filled_avg_price: float | None = None
    filled_qty: float
    created_at: str
    time_in_force: str
    limit_price: float | None = None


class PlaceOrderRequest(BaseModel):
    symbol: str
    qty: float | None = None
    notional: float | None = None
    side: Literal["buy", "sell"]
    type: Literal["market", "limit", "stop", "stop_limit"] = "market"
    time_in_force: Literal["day", "gtc", "ioc", "fok"] = "day"
    limit_price: float | None = None
    stop_price: float | None = None


# ─── Helper: parse Alpaca order dict ─────────────────────────────────────────

def _parse_order(o: dict) -> AlpacaOrder:
    return AlpacaOrder(
        id=o["id"],
        symbol=o["symbol"],
        side=o["side"],
        qty=float(o["qty"]) if o.get("qty") else None,
        notional=float(o["notional"]) if o.get("notional") else None,
        order_type=o.get("order_type", o.get("type", "market")),
        status=o["status"],
        filled_avg_price=float(o["filled_avg_price"]) if o.get("filled_avg_price") else None,
        filled_qty=float(o.get("filled_qty", 0) or 0),
        created_at=o["created_at"],
        time_in_force=o.get("time_in_force", "day"),
        limit_price=float(o["limit_price"]) if o.get("limit_price") else None,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "/account",
    response_model=AlpacaAccount,
    summary="Fetch Alpaca trading account info",
)
async def get_account(
    x_alpaca_key: str = Header(..., alias="X-Alpaca-Key"),
    x_alpaca_secret: str = Header(..., alias="X-Alpaca-Secret"),
    x_alpaca_base_url: str = Header(default=ALPACA_PAPER_URL, alias="X-Alpaca-Base-Url"),
) -> AlpacaAccount:
    d = await _request("GET", "/v2/account", x_alpaca_key, x_alpaca_secret, x_alpaca_base_url)
    return AlpacaAccount(
        id=d["id"],
        buying_power=float(d.get("buying_power", 0)),
        portfolio_value=float(d.get("portfolio_value", 0)),
        equity=float(d.get("equity", 0)),
        cash=float(d.get("cash", 0)),
        long_market_value=float(d.get("long_market_value", 0)),
        short_market_value=float(d.get("short_market_value", 0)),
        daytrade_count=int(d.get("daytrade_count", 0)),
        pattern_day_trader=bool(d.get("pattern_day_trader", False)),
        trading_blocked=bool(d.get("trading_blocked", False)),
    )


@router.get(
    "/positions",
    response_model=list[AlpacaPosition],
    summary="List open positions",
)
async def get_positions(
    x_alpaca_key: str = Header(..., alias="X-Alpaca-Key"),
    x_alpaca_secret: str = Header(..., alias="X-Alpaca-Secret"),
    x_alpaca_base_url: str = Header(default=ALPACA_PAPER_URL, alias="X-Alpaca-Base-Url"),
) -> list[AlpacaPosition]:
    data = await _request("GET", "/v2/positions", x_alpaca_key, x_alpaca_secret, x_alpaca_base_url)
    return [
        AlpacaPosition(
            symbol=p["symbol"],
            qty=float(p.get("qty", 0)),
            side=p.get("side", "long"),
            avg_entry_price=float(p.get("avg_entry_price", 0)),
            current_price=float(p["current_price"]) if p.get("current_price") else None,
            unrealized_pl=float(p.get("unrealized_pl", 0)),
            unrealized_plpc=float(p.get("unrealized_plpc", 0)),
            market_value=float(p["market_value"]) if p.get("market_value") else None,
        )
        for p in data
    ]


@router.get(
    "/orders",
    response_model=list[AlpacaOrder],
    summary="List orders",
)
async def get_orders(
    x_alpaca_key: str = Header(..., alias="X-Alpaca-Key"),
    x_alpaca_secret: str = Header(..., alias="X-Alpaca-Secret"),
    x_alpaca_base_url: str = Header(default=ALPACA_PAPER_URL, alias="X-Alpaca-Base-Url"),
    limit: int = Query(default=25, ge=1, le=500),
    order_status: str = Query(default="all", alias="status"),
) -> list[AlpacaOrder]:
    data = await _request(
        "GET", "/v2/orders",
        x_alpaca_key, x_alpaca_secret, x_alpaca_base_url,
        params={"limit": limit, "status": order_status},
    )
    return [_parse_order(o) for o in data]


@router.post(
    "/orders",
    response_model=AlpacaOrder,
    status_code=201,
    summary="Place an order",
)
async def place_order(
    req: PlaceOrderRequest,
    x_alpaca_key: str = Header(..., alias="X-Alpaca-Key"),
    x_alpaca_secret: str = Header(..., alias="X-Alpaca-Secret"),
    x_alpaca_base_url: str = Header(default=ALPACA_PAPER_URL, alias="X-Alpaca-Base-Url"),
) -> AlpacaOrder:
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

    o = await _request("POST", "/v2/orders", x_alpaca_key, x_alpaca_secret, x_alpaca_base_url, json=body)
    logger.info(
        "order_placed",
        symbol=req.symbol,
        side=req.side,
        qty=req.qty,
        mode="live" if x_alpaca_base_url == ALPACA_LIVE_URL else "paper",
        order_id=o.get("id"),
    )
    return _parse_order(o)


@router.delete(
    "/orders/{order_id}",
    status_code=204,
    response_class=Response,
    summary="Cancel a single order",
)
async def cancel_order(
    order_id: str = Path(...),
    x_alpaca_key: str = Header(..., alias="X-Alpaca-Key"),
    x_alpaca_secret: str = Header(..., alias="X-Alpaca-Secret"),
    x_alpaca_base_url: str = Header(default=ALPACA_PAPER_URL, alias="X-Alpaca-Base-Url"),
) -> Response:
    await _request(
        "DELETE", f"/v2/orders/{order_id}",
        x_alpaca_key, x_alpaca_secret, x_alpaca_base_url,
    )
    logger.info("order_cancelled", order_id=order_id)
    return Response(status_code=204)


@router.delete(
    "/orders",
    status_code=207,
    summary="Cancel all open orders",
)
async def cancel_all_orders(
    x_alpaca_key: str = Header(..., alias="X-Alpaca-Key"),
    x_alpaca_secret: str = Header(..., alias="X-Alpaca-Secret"),
    x_alpaca_base_url: str = Header(default=ALPACA_PAPER_URL, alias="X-Alpaca-Base-Url"),
) -> list[dict]:
    result = await _request("DELETE", "/v2/orders", x_alpaca_key, x_alpaca_secret, x_alpaca_base_url)
    logger.info("all_orders_cancelled")
    return result if isinstance(result, list) else []
