import duckdb
import os

DB_PATH = "d:/project/lang/backend/research_platform.duckdb"
con = duckdb.connect(DB_PATH)
con.execute("INSTALL spatial; LOAD spatial;")

min_lon, min_lat, max_lon, max_lat = (-180, -90, 180, 90)
dataset = "arch_demo_1"
csv_file = "d:/project/lang/data/archaeology/arch_demo_1/archaeology.csv"

query = f"""
WITH raw_data AS (
    SELECT 
        CAST(Longitude AS DOUBLE) as lon, 
        CAST(Latitude AS DOUBLE) as lat,
        * 
    FROM read_csv_auto('{csv_file}')
    WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL
),
mvt_geom AS (
    SELECT 
        ST_AsMVTGeom(
            ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3857'),
            ST_Transform(ST_MakeEnvelope({min_lon}, {min_lat}, {max_lon}, {max_lat}, 4326), 'EPSG:4326', 'EPSG:3857'),
            4096, 256, true
        ) AS geom,
        * EXCLUDE (geom)
    FROM raw_data
    WHERE lon >= {min_lon} AND lon <= {max_lon} AND lat >= {min_lat} AND lat <= {max_lat}
)
SELECT ST_AsMVT(mvt_geom, '{dataset}', 4096, 'geom') FROM mvt_geom;
"""

try:
    print("Executing query...")
    res = con.execute(query).fetchone()
    print("Success! Data length:", len(res[0]) if res[0] else 0)
except Exception as e:
    print("ERROR:", e)
finally:
    con.close()
