"""
AI Service – FastAPI application exposing detection, change detection,
anomaly scoring, and multi-sensor fusion endpoints.
"""
from fastapi import FastAPI
from detection.detector import router as detection_router
from change_detection.change_detector import router as change_router
from anomaly_detection.anomaly_scorer import router as anomaly_router
from fusion.fusion_engine import router as fusion_router

app = FastAPI(title="OSINT Earth AI Service", version="1.0.0")

app.include_router(detection_router, prefix="/detect", tags=["detection"])
app.include_router(change_router, prefix="/change", tags=["change-detection"])
app.include_router(anomaly_router, prefix="/anomaly", tags=["anomaly"])
app.include_router(fusion_router, prefix="/fusion", tags=["fusion"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai"}
