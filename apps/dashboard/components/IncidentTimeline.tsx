import { eventClassName, formatDate, formatMs } from "../lib/format";
import type { TelemetryEvent } from "../lib/types";
import { EmptyState } from "./ui";

function eventDetails(event: TelemetryEvent): string[] {
  const details: string[] = [];
  if (event.provider) details.push(`Provider ${event.provider}`);
  if (event.attempt !== undefined) details.push(`Attempt ${event.attempt}`);
  if (event.status !== undefined) details.push(`HTTP ${event.status}`);
  if (event.latencyMs !== undefined) details.push(formatMs(event.latencyMs));
  if (event.retryDelayMs !== undefined) details.push(`Backoff ${formatMs(event.retryDelayMs)}`);
  if (event.fallbackUsed) details.push("Fallback path");
  return details;
}

export function IncidentTimeline({ events }: { events: TelemetryEvent[] }) {
  if (events.length === 0) return <EmptyState title="Timeline unavailable" detail="The incident returned no ordered event records." />;
  return <div className="timeline" aria-label="Incident event timeline">{events.map((event) => <div className="timeline-item" key={event.id}><span className={`timeline-marker ${eventClassName(event.type)}`} aria-hidden="true" /><div className="timeline-event"><div className="timeline-event-topline"><span className={`event-type ${eventClassName(event.type)}`}>{event.type}</span><time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time></div><div className="timeline-event-details">{eventDetails(event).map((detail) => <span key={detail}>{detail}</span>)}</div>{event.attributes?.message && typeof event.attributes.message === "string" ? <p className="timeline-note">{event.attributes.message}</p> : null}</div></div>)}</div>;
}

export function ObservedIncidentFlow({ events }: { events: TelemetryEvent[] }) {
  const primaryProvider = events.find((event) => event.type === "provider.response" && event.provider)?.provider;
  const failedResponses = events.filter((event) => event.type === "provider.response" && event.provider === primaryProvider && typeof event.status === "number" && event.status >= 400);
  const retryEvents = events.filter((event) => event.type === "router.retry_scheduled");
  const fallbackEvent = events.find((event) => event.type === "router.fallback");
  const successfulFallback = events.find((event) => event.type === "provider.response" && event.fallbackUsed === true && typeof event.status === "number" && event.status >= 200 && event.status < 300);
  const steps = [
    failedResponses.length > 0 && primaryProvider ? { label: "Observed failure", value: `${failedResponses.length} HTTP failures from Provider ${primaryProvider}` } : null,
    retryEvents.length > 0 ? { label: "Observed amplifier", value: `${retryEvents.length} retry event${retryEvents.length === 1 ? "" : "s"} / backoff cycle${retryEvents.length === 1 ? "" : "s"}` } : null,
    fallbackEvent ? { label: "Observed recovery path", value: "Fallback activated" } : null,
    successfulFallback?.provider ? { label: "Observed outcome", value: `Provider ${successfulFallback.provider} succeeded` } : null,
  ].filter((step): step is { label: string; value: string } => step !== null);
  return <div className="flow-panel"><div className="flow-label">Observed Incident Flow</div>{steps.length === 0 ? <p className="muted">Not enough returned event fields to render the flow.</p> : <div className="flow-steps">{steps.map((step, index) => <div className="flow-step-wrap" key={step.label}><div className="flow-step"><span>{step.label}</span><strong>{step.value}</strong></div>{index < steps.length - 1 ? <span className="flow-arrow" aria-hidden="true">→</span> : null}</div>)}</div>}</div>;
}
