"""
Change detection between two temporally separated satellite images.
Detects: new construction, deforestation, excavations, industrial development.
"""
import io
import numpy as np
from PIL import Image
from fastapi import APIRouter, UploadFile, File, Query

router = APIRouter()

CHANGE_CLASSES = {
    "construction": (200, 200, 200),
    "deforestation": (0, 128, 0),
    "excavation": (139, 90, 43),
    "industrial": (128, 128, 128),
}


@router.post("/detect")
async def detect_changes(
    image_t1: UploadFile = File(..., description="Earlier image"),
    image_t2: UploadFile = File(..., description="Later image"),
    threshold: float = Query(30.0, ge=0.0, le=255.0),
    min_area_px: int = Query(100, ge=1),
):
    """
    Compare two images (T1, T2) and detect significant changes.
    Uses normalized difference with morphological filtering.
    """
    t1_bytes = await image_t1.read()
    t2_bytes = await image_t2.read()

    img1 = np.array(Image.open(io.BytesIO(t1_bytes)).convert("RGB"), dtype=np.float32)
    img2 = np.array(Image.open(io.BytesIO(t2_bytes)).convert("RGB"), dtype=np.float32)

    if img1.shape != img2.shape:
        h = min(img1.shape[0], img2.shape[0])
        w = min(img1.shape[1], img2.shape[1])
        img1 = img1[:h, :w]
        img2 = img2[:h, :w]

    diff = np.abs(img2 - img1)
    diff_gray = np.mean(diff, axis=2)

    change_mask = (diff_gray > threshold).astype(np.uint8)

    try:
        import cv2
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        change_mask = cv2.morphologyEx(change_mask, cv2.MORPH_OPEN, kernel)
        change_mask = cv2.morphologyEx(change_mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(change_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    except ImportError:
        contours = []

    regions = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area_px:
            continue
        x, y, w, h = cv2.boundingRect(c)
        cx, cy = x + w // 2, y + h // 2

        region_pixels = img2[y:y+h, x:x+w]
        mean_color = region_pixels.mean(axis=(0, 1))

        classification = _classify_change(mean_color)

        regions.append({
            "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
            "area_px": int(area),
            "centroid_px": {"x": int(cx), "y": int(cy)},
            "classification": classification,
        })

    total_changed = int(change_mask.sum())
    total_pixels = change_mask.size
    change_pct = round(total_changed / total_pixels * 100, 2) if total_pixels else 0

    return {
        "image_size": {"height": int(img1.shape[0]), "width": int(img1.shape[1])},
        "threshold": threshold,
        "change_percentage": change_pct,
        "region_count": len(regions),
        "regions": regions,
    }


def _classify_change(mean_rgb):
    """Simple rule-based classification based on average color of changed region."""
    r, g, b = mean_rgb
    if g > r and g > b and g > 80:
        return "deforestation"
    if r > 150 and g > 150 and b > 150:
        return "construction"
    if r > 100 and g < 80 and b < 60:
        return "excavation"
    return "industrial"
