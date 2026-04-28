from slowapi import Limiter
from slowapi.util import get_remote_address

# Single shared limiter instance — used by both the app factory (app.state.limiter)
# and route decorators (@limiter.limit("N/minute")).  Sharing the same instance
# prevents slowapi from creating a mismatched decorator that breaks FastAPI's
# Pydantic/OpenAPI route introspection.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
