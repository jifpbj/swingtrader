"""
Alpaca Broker API Client
────────────────────────
Server-side singleton that wraps all Broker API calls with HTTP Basic auth.

The Broker API lets Predict Alpha act as a broker — creating and managing
end-user trading accounts, ACH bank relationships, fund transfers, and orders
on behalf of users.  No per-user API keys are needed.

Sandbox base URL : https://broker-api.sandbox.alpaca.markets
Production URL   : https://broker-api.alpaca.markets
Auth             : HTTP Basic — base64(BROKER_KEY:BROKER_SECRET)

Docs: https://docs.alpaca.markets/reference/api-references
"""

from __future__ import annotations

import base64
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _basic_auth_header(key: str, secret: str) -> str:
    token = base64.b64encode(f"{key}:{secret}".encode()).decode()
    return f"Basic {token}"


class BrokerClient:
    """
    Thin async wrapper around the Alpaca Broker REST API.

    All methods raise HTTPException on Alpaca error responses so that
    FastAPI routes can propagate them directly to callers.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._base_url = settings.alpaca_broker_url
        self._data_url = settings.alpaca_broker_data_url
        auth = _basic_auth_header(settings.alpaca_broker_key, settings.alpaca_broker_secret)
        self._headers = {
            "Authorization": auth,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=30.0,
        )
        self._data_client = httpx.AsyncClient(
            base_url=self._data_url,
            headers=self._headers,
            timeout=30.0,
        )

    async def close(self) -> None:
        await self._client.aclose()
        await self._data_client.aclose()

    # ─── Internal request helper ──────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        client: httpx.AsyncClient | None = None,
        **kwargs: Any,
    ) -> Any:
        c = client or self._client
        try:
            resp = await c.request(method, path, **kwargs)
        except httpx.RequestError as exc:
            logger.error("broker_api_network_error", path=path, error=str(exc))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach Alpaca Broker API.",
            )

        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Broker API credentials invalid.")
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Broker API access forbidden.")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Resource not found in Broker API.")
        if resp.status_code == 422:
            body = resp.json() if resp.content else {}
            msg = body.get("message", str(body))
            raise HTTPException(status_code=422, detail=f"Broker API validation error: {msg}")
        if not resp.is_success:
            body = resp.json() if resp.content else {}
            msg = body.get("message", body.get("detail", str(resp.status_code)))
            logger.warning("broker_api_error", path=path, status=resp.status_code, body=body)
            raise HTTPException(status_code=resp.status_code, detail=f"Broker API: {msg}")

        return resp.json() if resp.content else {}

    # ─── Accounts ─────────────────────────────────────────────────────────────

    async def create_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/accounts — submit KYC + open a trading account for an end user."""
        result = await self._request("POST", "/v1/accounts", json=payload)
        logger.info("broker_account_created", account_id=result.get("id"))
        return result

    async def get_account(self, account_id: str) -> dict[str, Any]:
        """GET /v1/accounts/{account_id}"""
        return await self._request("GET", f"/v1/accounts/{account_id}")

    async def list_accounts(self, query: str = "") -> list[dict[str, Any]]:
        """GET /v1/accounts — list all accounts (optional search query)."""
        params = {"query": query} if query else {}
        return await self._request("GET", "/v1/accounts", params=params)

    # ─── ACH Relationships ────────────────────────────────────────────────────

    async def list_ach_relationships(self, account_id: str) -> list[dict[str, Any]]:
        """GET /v1/accounts/{account_id}/ach_relationships"""
        result = await self._request("GET", f"/v1/accounts/{account_id}/ach_relationships")
        return result if isinstance(result, list) else []

    async def create_ach_relationship(
        self, account_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /v1/accounts/{account_id}/ach_relationships"""
        result = await self._request(
            "POST", f"/v1/accounts/{account_id}/ach_relationships", json=payload
        )
        logger.info("ach_relationship_created", account_id=account_id, rel_id=result.get("id"))
        return result

    async def delete_ach_relationship(self, account_id: str, relationship_id: str) -> None:
        """DELETE /v1/accounts/{account_id}/ach_relationships/{relationship_id}"""
        await self._request(
            "DELETE", f"/v1/accounts/{account_id}/ach_relationships/{relationship_id}"
        )
        logger.info("ach_relationship_deleted", account_id=account_id, rel_id=relationship_id)

    # ─── Transfers ────────────────────────────────────────────────────────────

    async def list_transfers(self, account_id: str) -> list[dict[str, Any]]:
        """GET /v1/accounts/{account_id}/transfers"""
        result = await self._request("GET", f"/v1/accounts/{account_id}/transfers")
        return result if isinstance(result, list) else []

    async def create_transfer(
        self, account_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /v1/accounts/{account_id}/transfers"""
        result = await self._request(
            "POST", f"/v1/accounts/{account_id}/transfers", json=payload
        )
        logger.info(
            "transfer_created",
            account_id=account_id,
            transfer_id=result.get("id"),
            direction=payload.get("direction"),
            amount=payload.get("amount"),
        )
        return result

    # ─── Trading (orders / positions via Broker API) ──────────────────────────

    async def get_positions(self, account_id: str) -> list[dict[str, Any]]:
        """GET /v1/trading/accounts/{account_id}/positions"""
        result = await self._request("GET", f"/v1/trading/accounts/{account_id}/positions")
        return result if isinstance(result, list) else []

    async def get_orders(
        self,
        account_id: str,
        limit: int = 25,
        order_status: str = "all",
    ) -> list[dict[str, Any]]:
        """GET /v1/trading/accounts/{account_id}/orders"""
        result = await self._request(
            "GET",
            f"/v1/trading/accounts/{account_id}/orders",
            params={"limit": limit, "status": order_status},
        )
        return result if isinstance(result, list) else []

    async def place_order(
        self, account_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /v1/trading/accounts/{account_id}/orders"""
        result = await self._request(
            "POST", f"/v1/trading/accounts/{account_id}/orders", json=payload
        )
        logger.info(
            "broker_order_placed",
            account_id=account_id,
            order_id=result.get("id"),
            symbol=payload.get("symbol"),
            side=payload.get("side"),
        )
        return result

    async def cancel_order(self, account_id: str, order_id: str) -> None:
        """DELETE /v1/trading/accounts/{account_id}/orders/{order_id}"""
        await self._request(
            "DELETE", f"/v1/trading/accounts/{account_id}/orders/{order_id}"
        )
        logger.info("broker_order_cancelled", account_id=account_id, order_id=order_id)

    async def cancel_all_orders(self, account_id: str) -> list[dict[str, Any]]:
        """DELETE /v1/trading/accounts/{account_id}/orders"""
        result = await self._request(
            "DELETE", f"/v1/trading/accounts/{account_id}/orders"
        )
        return result if isinstance(result, list) else []

    async def get_trading_account(self, account_id: str) -> dict[str, Any]:
        """GET /v1/trading/accounts/{account_id}/account — buying power, equity, etc."""
        return await self._request("GET", f"/v1/trading/accounts/{account_id}/account")

    # ─── Market Data (broker-authenticated) ───────────────────────────────────

    async def get_bars(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 200,
        asset_class: str = "us_equity",
    ) -> dict[str, Any]:
        """
        Fetch OHLCV bars through the broker-authenticated data endpoint.

        For US equities: GET /v2/stocks/{symbol}/bars
        For crypto:      GET /v1beta3/crypto/us/bars
        """
        if asset_class == "crypto":
            path = "/v1beta3/crypto/us/bars"
            params: dict[str, Any] = {
                "symbols": symbol,
                "timeframe": timeframe,
                "limit": limit,
            }
        else:
            path = f"/v2/stocks/{symbol}/bars"
            params = {
                "timeframe": timeframe,
                "limit": limit,
                "feed": "iex",
            }
        return await self._request("GET", path, client=self._data_client, params=params)

    async def get_latest_trade(self, symbol: str, asset_class: str = "us_equity") -> dict[str, Any]:
        """Fetch the latest trade price via broker-auth data endpoint."""
        if asset_class == "crypto":
            path = "/v1beta3/crypto/us/latest/trades"
            params: dict[str, Any] = {"symbols": symbol}
        else:
            path = f"/v2/stocks/{symbol}/trades/latest"
            params = {"feed": "iex"}
        return await self._request("GET", path, client=self._data_client, params=params)


# ─── Singleton ────────────────────────────────────────────────────────────────

_broker_client: BrokerClient | None = None


def get_broker_client() -> BrokerClient:
    """Return the module-level BrokerClient singleton."""
    global _broker_client
    if _broker_client is None:
        _broker_client = BrokerClient()
    return _broker_client
