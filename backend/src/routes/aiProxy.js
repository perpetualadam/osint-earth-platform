import { Router } from "express";

const router = Router();
const AI_BASE = process.env.AI_SERVICE_URL || "http://localhost:8000";

router.post("/anomaly/scan", async (req, res) => {
  try {
    const hours = req.query.hours || 24;
    const anomalyType = req.query.anomaly_type || "all";
    const url = `${AI_BASE}/anomaly/scan?hours=${hours}&anomaly_type=${anomalyType}`;
    const r = await fetch(url, { method: "POST" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(r.status).json(data || { error: "AI service error" });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(503).json({
      error: "AI service unavailable",
      detail: "Ensure the AI service is running (docker compose up ai-service or python -m uvicorn ai_modules.main:app --port 8000)",
    });
  }
});

export default router;
