from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from app.db import get_db_connection
from app.utils.tile_math import tile_bounds
import os

router = APIRouter()

DATA_ROOT = "d:/project/lang/data"


@router.get("/tiles/{data_type}/{dataset}/{z}/{x}/{y}.pbf")
async def get_vector_tile(
    data_type: str,
    dataset: str,
    z: int,
    x: int,
    y: int,
    search: str = None,
    form_filter: str = None,
    parameter_filter: str = None,
):
    """
    Generates a Mapbox Vector Tile (MVT) dynamically.
    """
    min_lon, min_lat, max_lon, max_lat = tile_bounds(x, y, z)
    dataset_path = os.path.join(DATA_ROOT, data_type, dataset)
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found")

    con = get_db_connection()
    try:
        con.execute("LOAD spatial;")

        # Detect coordinate columns
        if data_type in ["spoken_language", "sign_language"]:
            target_csv = os.path.join(dataset_path, "languages.csv").replace("\\", "/")
        else:
            target_csv = os.path.join(dataset_path, f"{data_type}.csv").replace(
                "\\", "/"
            )

        cols_df = con.execute(
            f"DESCRIBE SELECT * FROM read_csv_auto('{target_csv}') LIMIT 0"
        ).df()
        col_names = cols_df["column_name"].tolist()

        lat_col = next((c for c in col_names if c.lower() == "latitude"), "Latitude")
        lon_col = next((c for c in col_names if c.lower() == "longitude"), "Longitude")

        # Build Query Source
        if data_type in ["spoken_language", "sign_language"]:
            lang_csv = target_csv
            forms_csv = os.path.join(dataset_path, "forms.csv").replace("\\", "/")
            params_csv = os.path.join(dataset_path, "parameters.csv").replace("\\", "/")

            source_query = f"read_csv_auto('{lang_csv}')"
            if form_filter or parameter_filter:
                source_query = f"""
                (
                    SELECT l.*, f.Value as form_value, p.Name as parameter_name
                    FROM read_csv_auto('{lang_csv}') l
                    JOIN read_csv_auto('{forms_csv}') f ON l.ID = f.Language_ID
                    JOIN read_csv_auto('{params_csv}') p ON f.Parameter_ID = p.ID
                )
                """

            conds = ["1=1"]
            if search:
                conds.append(f"(LOWER(Name) LIKE LOWER('%{search}%'))")
            if form_filter:
                conds.append(f"LOWER(form_value) LIKE LOWER('%{form_filter}%')")
            if parameter_filter:
                conds.append(
                    f"LOWER(parameter_name) LIKE LOWER('%{parameter_filter}%')"
                )
            where_clause = " AND ".join(conds)

        else:
            source_query = f"read_csv_auto('{target_csv}')"
            conds = ["1=1"]
            if search:
                conds.append(
                    f"(LOWER(Name) LIKE LOWER('%{search}%') OR LOWER(Description) LIKE LOWER('%{search}%'))"
                )
            where_clause = " AND ".join(conds)

        # FINAL CORRECT MVT Query: Manual Mercator projection to ensure perfect alignment
        # Formula: y = ln(tan(pi/4 + lat_rad/2))
        query = f"""
        SELECT ST_AsMVT(t, '{dataset}')
        FROM (
            SELECT 
                ST_AsMVTGeom(
                    ST_Point(
                        CAST({lon_col} AS DOUBLE), 
                        log(tan(radians(45 + CAST({lat_col} AS DOUBLE) / 2)))
                    ),
                    (
                        SELECT ST_Extent(ST_MakeEnvelope(
                            {min_lon}, 
                            log(tan(radians(45 + {min_lat} / 2))), 
                            {max_lon}, 
                            log(tan(radians(45 + {max_lat} / 2)))
                        ))
                    ),
                    4096, 256, true
                ) AS geom,
                '{dataset}' as dataset,
                * EXCLUDE ({lon_col}, {lat_col})
            FROM {source_query}
            WHERE {lat_col} IS NOT NULL AND {lon_col} IS NOT NULL AND {where_clause}
              AND CAST({lon_col} AS DOUBLE) >= {min_lon} AND CAST({lon_col} AS DOUBLE) <= {max_lon}
              AND CAST({lat_col} AS DOUBLE) >= {min_lat} AND CAST({lat_col} AS DOUBLE) <= {max_lat}
        ) t;
        """

        result = con.execute(query).fetchone()
        mvt_data = result[0] if result else None

        if mvt_data is None:
            return Response(content=b"", media_type="application/x-protobuf")

        return Response(content=bytes(mvt_data), media_type="application/x-protobuf")

    except Exception as e:
        # Final fallback log for production stabilization
        print(f"CRITICAL MVT Error for {dataset}: {e}")
        return Response(content=b"", media_type="application/x-protobuf")
    finally:
        con.close()
