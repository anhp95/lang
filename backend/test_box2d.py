import duckdb


def test_duckdb_mvt_box2d():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, 1 AS id")

    print(
        "Testing ST_AsMVTGeom(geom, ST_MakeEnvelope(...)::BOX_2D, 4096, 256, true)..."
    )
    try:
        # Cast envelope to BOX_2D
        query = "SELECT ST_AsMVTGeom(geom, ST_MakeEnvelope(-180, -90, 180, 90)::BOX_2D, 4096, 256, true) FROM test"
        res = con.execute(query).fetchall()
        print("Success! Result count:", len(res))
    except Exception as e:
        print("Failed with cast:", e)

    print("\nTesting simpler ST_AsMVTGeom signature...")
    try:
        query = "SELECT ST_AsMVTGeom(geom, ST_MakeEnvelope(-180, -90, 180, 90)::BOX_2D) FROM test"
        res = con.execute(query).fetchall()
        print("Success! Result count:", len(res))
    except Exception as e:
        print("Failed simple:", e)


if __name__ == "__main__":
    test_duckdb_mvt_box2d()
