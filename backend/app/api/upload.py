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
    r"^y$",  # Exact match for Y
    r"\by\b",
    r"coord.*y",
    r"point[._\s-]?y",  # Matches point_y, point.y, pointy
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
    r"^x$",  # Exact match for X
    r"\bx\b",
    r"coord.*x",
    r"point[._\s-]?x",  # Matches point_x, point.x, pointx
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

            # Filter data with valid coordinates for map visualization
            filtered_data = []
            if detected["lat"] and detected["lon"]:
                lat_col = detected["lat"]
                lon_col = detected["lon"]
                for record in data:
                    lat = record.get(lat_col)
                    lon = record.get(lon_col)
                    if lat is not None and lon is not None:
                        try:
                            lat_float = float(lat)
                            lon_float = float(lon)
                            if -90 <= lat_float <= 90 and -180 <= lon_float <= 180:
                                filtered_data.append(record)
                        except (ValueError, TypeError):
                            continue

            return {
                "name": file.filename,
                "data": data,
                "filtered_data": filtered_data,
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

            geo_data = None
            detected = {"lat": None, "lon": None}

            # Handle FeatureCollection
            if isinstance(geojson, dict) and geojson.get("type") == "FeatureCollection":
                geo_data = geojson
                features = geojson.get("features", [])
                data = [f.get("properties", {}) for f in features]

                # Try to extract representative lat/lon if they are Points
                for feat in features:
                    geom = feat.get("geometry", {})
                    if geom and geom.get("type") == "Point":
                        coords = geom.get("coordinates", [])
                        if len(coords) >= 2:
                            detected = {"lat": "latitude", "lon": "longitude"}
                            break

                # If we detected Point features, inject lat/lon into properties for the table/logic
                if detected["lat"]:
                    for i, feat in enumerate(features):
                        geom = feat.get("geometry", {})
                        if geom and geom.get("type") == "Point":
                            coords = geom.get("coordinates", [])
                            data[i]["longitude"] = coords[0]
                            data[i]["latitude"] = coords[1]

            # Handle standard list of records
            elif isinstance(geojson, list):
                data = geojson
                if len(data) > 0:
                    keys = list(data[0].keys())
                    detected = detect_coordinates(keys)

            # Handle single Feature or Geometry (rare)
            elif isinstance(geojson, dict) and geojson.get("type") in [
                "Feature",
                "Point",
                "LineString",
                "Polygon",
                "MultiPoint",
                "MultiLineString",
                "MultiPolygon",
            ]:
                geo_data = geojson
                if geojson.get("type") == "Feature":
                    data = [geojson.get("properties", {})]
                else:
                    data = []
            else:
                if isinstance(geojson, dict):
                    data = [geojson]
                    keys = list(geojson.keys())
                    detected = detect_coordinates(keys)
                else:
                    data = []

            # Filter data with valid coordinates for map visualization (if point-based)
            filtered_data = []
            if detected["lat"] and detected["lon"]:
                lat_col = detected["lat"]
                lon_col = detected["lon"]
                for record in data:
                    lat = record.get(lat_col)
                    lon = record.get(lon_col)
                    if lat is not None and lon is not None:
                        try:
                            lat_float = float(lat)
                            lon_float = float(lon)
                            if -90 <= lat_float <= 90 and -180 <= lon_float <= 180:
                                filtered_data.append(record)
                        except (ValueError, TypeError):
                            continue

            return {
                "name": file.filename,
                "data": data,
                "filtered_data": filtered_data,
                "coordinates": detected,
                "type": "geojson" if geo_data else "json",
                "geo_data": geo_data,
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")

    except Exception as e:
        print(f"[Upload Error] {file.filename}: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")
