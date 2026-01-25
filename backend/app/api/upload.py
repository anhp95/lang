from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import shutil
import pandas as pd
import json
import re
import numpy as np
from typing import List, Dict, Any, Optional

router = APIRouter()
UPLOAD_DIR = "uploads"

# Robust patterns for latitude and longitude (case-insensitive)
LAT_PATTERNS = [
    r"latitude",
    r"\blat\b",
    r"lat[._\s-]",
    r"lat$",
    r"^lat",
    r"\by\b",
    r"coord.*y",
    r"north",
]
LON_PATTERNS = [
    r"longitude",
    r"\blon\b",
    r"\blng\b",
    r"\blong\b",
    r"lo?ng?[._\s-]",
    r"lon$",
    r"^lon",
    r"lng$",
    r"^lng",
    r"\bx\b",
    r"coord.*x",
    r"east",
]


def detect_coordinates(columns: List[str]) -> Dict[str, Optional[str]]:
    """
    Heuristically detect latitude and longitude columns based on naming patterns.
    """
    detected = {"lat": None, "lon": None}

    # Check for direct matches first (most reliable)
    for col in columns:
        low_col = col.lower().strip()

        # Longitude check
        if not detected["lon"]:
            if any(re.search(p, low_col) for p in LON_PATTERNS):
                detected["lon"] = col

        # Latitude check
        if not detected["lat"]:
            if any(re.search(p, low_col) for p in LAT_PATTERNS):
                detected["lat"] = col

    return detected


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # 50MB Size Limit
    MAX_SIZE = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    # Seek back to start for writing/processing
    await file.seek(0)

    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        data = []
        filename = file.filename.lower()

        if filename.endswith(".csv"):
            # Try multiple encodings for robustness
            df = None
            for encoding in ["utf-8", "latin1", "cp1252"]:
                try:
                    df = pd.read_csv(file_path, encoding=encoding)
                    break
                except Exception:
                    continue

            if df is None:
                raise Exception("Could not parse CSV with supported encodings")

            # Standardize column naming
            cols = df.columns.tolist()
            detected = detect_coordinates(cols)

            # Sanitize NaN/Inf for JSON compliance
            # Using the same logic as data.py
            data = [
                {
                    k: (
                        v
                        if v is not np.nan
                        and v == v
                        and not (isinstance(v, float) and np.isinf(v))
                        else None
                    )
                    for k, v in row.items()
                }
                for row in df.to_dict(orient="records")
            ]

            return {
                "name": file.filename,
                "data": data,
                "coordinates": detected,
                "type": "csv",
            }

        elif filename.endswith(".geojson") or filename.endswith(".json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    geojson = json.load(f)
            except UnicodeDecodeError:
                with open(file_path, "r", encoding="latin1") as f:
                    geojson = json.load(f)

            # Handle GeoJSON structures
            if geojson.get("type") == "FeatureCollection":
                features = geojson.get("features", [])
                for feat in features:
                    props = feat.get("properties", {})
                    geom = feat.get("geometry", {})

                    # Extract coords if point
                    if geom.get("type") == "Point":
                        coords = geom.get("coordinates", [])
                        if len(coords) >= 2:
                            props["longitude"] = coords[0]
                            props["latitude"] = coords[1]

                    data.append(props)

            return {
                "name": file.filename,
                "data": data,
                "coordinates": {"lat": "latitude", "lon": "longitude"},
                "type": "geojson",
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")

    except Exception as e:
        print(f"[Upload Error] {file.filename}: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")
