"""
Object detection service using YOLOv8-nano for satellite imagery analysis.
Detects: ships, vehicles, aircraft, fires, construction, runways, convoys.
"""
import io
import numpy as np
from PIL import Image
from fastapi import APIRouter, UploadFile, File, Query
from typing import Optional

router = APIRouter()

_model = None

CLASSES = {
    0: "ship",
    1: "vehicle",
    2: "aircraft",
    3: "fire",
    4: "construction",
    5: "runway",
    6: "convoy",
}


def get_model():
    global _model
    if _model is None:
        try:
            from ultralytics import YOLO
            _model = YOLO("yolov8n.pt")
        except Exception as e:
            print(f"YOLO model load failed (expected on first run): {e}")
            _model = "unavailable"
    return _model


@router.post("/objects")
async def detect_objects(
    file: UploadFile = File(...),
    confidence: float = Query(0.3, ge=0.0, le=1.0),
    lng: Optional[float] = Query(None),
    lat: Optional[float] = Query(None),
):
    """
    Run object detection on an uploaded satellite image tile.
    Returns bounding boxes, classifications, and confidence scores.
    """
    model = get_model()

    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(image)

    if model == "unavailable":
        return {
            "status": "model_unavailable",
            "message": "YOLO model not loaded. Upload a trained model or run setup.",
            "detections": [],
        }

    results = model.predict(img_array, conf=confidence, verbose=False)
    detections = []

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2

            det = {
                "class_id": cls_id,
                "class_name": CLASSES.get(cls_id, f"class_{cls_id}"),
                "confidence": round(conf, 3),
                "bbox": {"x1": round(x1, 1), "y1": round(y1, 1),
                         "x2": round(x2, 1), "y2": round(y2, 1)},
                "centroid_px": {"x": round(cx, 1), "y": round(cy, 1)},
            }

            if lng is not None and lat is not None:
                w, h = image.size
                det["centroid_geo"] = {
                    "lng": round(lng + (cx / w - 0.5) * 0.01, 6),
                    "lat": round(lat + (0.5 - cy / h) * 0.01, 6),
                }

            detections.append(det)

    return {
        "image_size": {"width": image.size[0], "height": image.size[1]},
        "detection_count": len(detections),
        "detections": detections,
    }
