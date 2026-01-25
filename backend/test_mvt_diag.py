import duckdb

con = duckdb.connect()
con.execute("LOAD spatial;")
dataset = "abrahammonpa"
lang_csv = "d:/project/lang/data/spoken_language/abrahammonpa/languages.csv"
min_lon, min_lat, max_lon, max_lat = (-180, -85.05, 180, 85.05)
lon_col, lat_col = "Longitude", "Latitude"

query = f"""
SELECT count(*)
FROM read_csv_auto('{lang_csv}')
WHERE {lat_col} IS NOT NULL AND {lon_col} IS NOT NULL
  AND CAST({lon_col} AS DOUBLE) >= {min_lon} AND CAST({lon_col} AS DOUBLE) <= {max_lon}
  AND CAST({lat_col} AS DOUBLE) >= {min_lat} AND CAST({lat_col} AS DOUBLE) <= {max_lat}
"""
print(f"Filter check: {con.execute(query).fetchone()[0]} rows found")

proj_query = f"""
SELECT 
    ST_AsText(ST_Transform(ST_SetSRID(ST_Point(92.11, 27.10), 4326), 'EPSG:3857')) as point,
    ST_AsText(ST_Transform(ST_SetSRID(ST_MakeEnvelope({min_lon}, {min_lat}, {max_lon}, {max_lat}), 4326), 'EPSG:3857')) as env
"""
res = con.execute(proj_query).fetchone()
print(f"Sample Point: {res[0]}")
print(f"Env: {res[1]}")

mvt_query = f"""
SELECT octet_length(ST_AsMVT(t, '{dataset}'))
FROM (
    SELECT 
        ST_AsMVTGeom(
            ST_Transform(ST_Point(CAST({lon_col} AS DOUBLE), CAST({lat_col} AS DOUBLE)), 'EPSG:4326', 'EPSG:3857'),
            (SELECT ST_Extent(ST_Transform(ST_MakeEnvelope({min_lon}, {min_lat}, {max_lon}, {max_lat}), 'EPSG:4326', 'EPSG:3857'))),
            4096, 256, true
        ) AS geom,
        * EXCLUDE ({lon_col}, {lat_col})
    FROM read_csv_auto('{lang_csv}')
    WHERE {lat_col} IS NOT NULL AND {lon_col} IS NOT NULL
      AND CAST({lon_col} AS DOUBLE) >= {min_lon} AND CAST({lon_col} AS DOUBLE) <= {max_lon}
      AND CAST({lat_col} AS DOUBLE) >= {min_lat} AND CAST({lat_col} AS DOUBLE) <= {max_lat}
) t;
"""
print(f"MVT Length: {con.execute(mvt_query).fetchone()[0]}")
