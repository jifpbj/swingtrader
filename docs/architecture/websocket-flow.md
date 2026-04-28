# WebSocket Data Flow

Sequence diagram for a client subscribing to live market data.

```mermaid
sequenceDiagram
    participant C as Browser Client
    participant API as FastAPI Backend
    participant SM as AlpacaStreamManager
    participant SS as StreamState Registry

    C->>API: WS connect /ws/trades/{ticker}?timeframe=15Min&horizon=10
    API->>API: Verify Firebase ID token (optional auth)
    API->>SS: Lookup (ticker, timeframe, horizon) key

    alt Stream already running
        SS-->>API: Existing StreamState found
        API->>SS: Add client WebSocket to state.clients set
    else No stream yet
        API->>SS: Create new StreamState
        API->>SM: Launch producer task (asyncio.create_task)
        SM->>SM: Connect to Alpaca WS feed
    end

    API->>C: {"type": "subscribe_ack", "ticker": "AAPL", ...}

    loop Every tick (~1s)
        SM->>SS: Emit Candle
        SS->>C: {"type": "candle", "data": {...}}
    end

    loop Every 5 ticks
        API->>API: compute_indicators(df) [in executor]
        API->>C: {"type": "indicator", "data": {rsi, macd, bollinger, ...}}
    end

    loop Every 15 ticks
        API->>API: model.predict(indicators) [in executor]
        API->>C: {"type": "prediction", "data": {direction, confidence, bands}}
    end

    note over API,C: Signals emitted on threshold crossing (RSI, MACD, volume)

    C->>API: WS disconnect
    API->>SS: Remove client from state.clients
    alt No clients remain
        SS->>SM: Cancel producer task
        SM->>SM: Disconnect Alpaca feed
        SS->>SS: Remove StreamState from registry
    end
```

## Scaling Note

The current in-memory `_streams` registry is **single-process only**.  
Cloud Run scales each service to one instance per request burst — if multiple  
instances run, clients on different instances won't receive each other's ticks.

**Production path**: Replace `_streams` dict with a Redis pub/sub channel keyed  
by `(ticker, timeframe)`. Each instance subscribes; the producer runs on exactly  
one instance (via a distributed lock).
