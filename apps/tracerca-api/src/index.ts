import express from "express";
import incidentsRouter from "./routes/incidents";
import replaysRouter from "./routes/replays";
import telemetryRouter from "./routes/telemetry";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.TRACERCA_API_PORT ?? "4004", 10);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "tracerca-api",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Route mounts
// /api/incidents  → incidents router  (GET /, /:id, /:id/events, /:id/metrics)
// /api            → replays router    (POST /replay, GET /replays, GET /replays/:id)
// /api/telemetry  → telemetry router  (GET /events, GET /summary)
// ---------------------------------------------------------------------------

app.use("/api/incidents", incidentsRouter);
app.use("/api", replaysRouter);
app.use("/api/telemetry", telemetryRouter);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      event: "tracerca-api-started",
      port: PORT,
      timestamp: new Date().toISOString(),
    })
  );
});
