"""
OpenTelemetry instrumentation.

Configures tracing for the FastAPI app and injects trace context into
every structlog log entry so logs and traces are co-indexed by trace_id.

Exporters:
  - Prod (APP_ENV == production): CloudTraceSpanExporter → Google Cloud Trace
      Requires: opentelemetry-exporter-gcp-trace installed + roles/cloudtrace.agent on SA
      Project auto-detected from GOOGLE_CLOUD_PROJECT env var (set automatically on Cloud Run).
  - Dev  (APP_ENV != production) + JAEGER_ENDPOINT set: OTLP gRPC → Jaeger
  - Dev  (fallback): console (stdout)
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI

logger = logging.getLogger(__name__)


def configure_telemetry(app: FastAPI) -> None:
    """
    Wire up OpenTelemetry SDK and auto-instrument FastAPI.

    Call this from the lifespan or create_app() before the first request.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    except ImportError:
        logger.warning("opentelemetry-sdk not installed — tracing disabled")
        return

    app_env = os.getenv("APP_ENV", "development")

    # Skip all OTel setup in tests — no exporters, no background flush threads.
    if app_env == "testing":
        return

    resource = Resource.create(
        {
            "service.name": "predictive-alpha-api",
            "service.version": "1.0.0",
            "deployment.environment": app_env,
        }
    )

    provider = TracerProvider(resource=resource)

    jaeger_endpoint = os.getenv("JAEGER_ENDPOINT", "")

    if app_env == "production":
        try:
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")  # auto-set on Cloud Run
            exporter = CloudTraceSpanExporter(project_id=project_id)
            logger.info("otel_exporter: cloud_trace project=%s", project_id)
        except ImportError:
            logger.warning("opentelemetry-exporter-gcp-trace not installed — falling back to console")
            exporter = ConsoleSpanExporter()
    elif jaeger_endpoint:
        # Dev: send traces to local Jaeger via OTLP gRPC (docker-compose: http://jaeger:4317)
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=jaeger_endpoint, insecure=True)
            logger.info("otel_exporter: jaeger endpoint=%s", jaeger_endpoint)
        except ImportError:
            logger.warning("OTLP exporter not installed — falling back to console")
            exporter = ConsoleSpanExporter()
    else:
        exporter = ConsoleSpanExporter()
        logger.info("otel_exporter: console")

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # Auto-instrument FastAPI — adds a span for every HTTP request
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor.instrument_app(app)
        logger.info("otel_fastapi_instrumented")
    except ImportError:
        logger.warning("opentelemetry-instrumentation-fastapi not installed")
        return

    # Inject trace_id into structlog context for co-indexed logs + traces
    _patch_structlog_with_trace_context()


def _patch_structlog_with_trace_context() -> None:
    """
    Add a structlog processor that injects the current OTel trace_id and
    span_id into every log record.  This lets Cloud Logging / Datadog
    correlate log lines with their trace spans.

    No-ops gracefully if structlog or opentelemetry is unavailable.
    """
    try:
        import structlog
        from opentelemetry import trace
    except ImportError:
        return

    def _inject_trace_context(logger, method, event_dict):
        span = trace.get_current_span()
        if span and span.is_recording():
            ctx = span.get_span_context()
            event_dict["trace_id"] = format(ctx.trace_id, "032x")
            event_dict["span_id"] = format(ctx.span_id, "016x")
        return event_dict

    # Prepend to structlog's processor chain so every log call includes IDs
    existing = structlog.get_config().get("processors", [])
    if _inject_trace_context not in existing:
        structlog.configure(processors=[_inject_trace_context] + existing)
