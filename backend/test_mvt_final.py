import duckdb


def test_duckdb_mvt_final():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute(
        "CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, 'a' AS name, 1 AS id"
    )

    print("DuckDB Version:", con.execute("PRAGMA version").fetchone()[0])

    print("\nTesting ST_AsMVTGeom with explicit doubles...")
    try:
        query = "SELECT ST_AsMVTGeom(geom, ST_MakeEnvelope(-180.0, -90.0, 180.0, 90.0), 4096.0, 256.0, true) FROM test"
        res = con.execute(query).fetchall()
        print("Success ST_AsMVTGeom with doubles")
    except Exception as e:
        print("Failed ST_AsMVTGeom with doubles:", e)

    print("\nTesting ST_AsMVTGeom with integers...")
    try:
        query = "SELECT ST_AsMVTGeom(geom, ST_MakeEnvelope(-180.0, -90.0, 180.0, 90.0), 4096, 256, true) FROM test"
        res = con.execute(query).fetchall()
        print("Success ST_AsMVTGeom with integers")
    except Exception as e:
        print("Failed ST_AsMVTGeom with integers:", e)

    print("\nTesting ST_AsMVT(GEOMETRY, ...) aggregate style?")
    # Some older versions or specific builds might take geom directly as an aggregate
    try:
        query = "SELECT ST_AsMVT(geom, 'layer') FROM test"
        res = con.execute(query).fetchall()
        print("Success ST_AsMVT(geom, ...)")
    except Exception as e:
        print("Failed ST_AsMVT(geom, ...):", e)


if __name__ == "__main__":
    test_duckdb_mvt_final()
