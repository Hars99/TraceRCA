import express from "express";
import router from "./router";
import telemetryRouter from "./telemetry/router";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.DEMO_APP_PORT ?? "3001", 10);

// Health
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Chat routes
app.use("/", router);

// Telemetry read-only endpoints
app.use("/telemetry", telemetryRouter);

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      event: "demo-ai-app-started",
      port: PORT,
      timestamp: new Date().toISOString(),
    })
  );
});
