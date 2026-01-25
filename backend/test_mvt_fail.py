import duckdb


def test_mvt_failure():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    min_lon, min_lat, max_lon, max_lat = (-180, -90, 180, 90)

    print("Testing ST_MakeEnvelope(4 args)...")
    try:
        con.execute(
            f"SELECT ST_MakeEnvelope({min_lon}, {min_lat}, {max_lon}, {max_lat})"
        ).fetchone()
        print("Success 4 args")
    except Exception as e:
        print("Failed 4 args:", e)

    print("\nTesting ST_MakeEnvelope(5 args)...")
    try:
        con.execute(
            f"SELECT ST_MakeEnvelope({min_lon}, {min_lat}, {max_lon}, {max_lat}, 4326)"
        ).fetchone()
        print("Success 5 args")
    except Exception as e:
        print("Failed 5 args:", e)

    print("\nTesting the actual tiles.py query structure...")
    con.execute(
        "CREATE TABLE raw_data AS SELECT 0.0 as lon, 0.0 as lat, 'test' as name"
    )
    query = f"""
    WITH mvt_geom AS (
        SELECT 
            ST_AsMVTGeom(
                ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3857'),
                ST_Transform(ST_MakeEnvelope({min_lon}, {min_lat}, {max_lon}, {max_lat}, 4326), 'EPSG:4326', 'EPSG:3857'),
                4096, 256, true
            ) AS geom,
            * EXCLUDE (lon, lat)
        FROM raw_data
    )
    SELECT ST_AsMVT(t, 'layer_name', 4096, 'geom') FROM mvt_geom t;
    """
    try:
        con.execute(query).fetchone()
        print("Full query success!")
    except Exception as e:
        print("Full query FAILED:", e)


if __name__ == "__main__":
    test_mvt_failure()
