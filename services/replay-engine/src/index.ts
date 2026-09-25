import express from "express";
import router from "./router";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.REPLAY_ENGINE_PORT ?? "4003", 10);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/", router);

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      event: "replay-engine-started",
      port: PORT,
      timestamp: new Date().toISOString(),
    })
  );
});
