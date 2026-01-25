import duckdb


def test_duckdb_mvt_double():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, 1 AS id")

    print("Testing ST_AsMVTGeom(geom, boundary, 4096.0, 256.0, true)...")
    try:
        # Pass 4096.0 and 256.0 (Doubles)
        query = "SELECT ST_AsMVTGeom(geom, ST_MakeEnvelope(-180, -90, 180, 90), 4096.0, 256.0, true) FROM test"
        res = con.execute(query).fetchall()
        print("Success! Result count:", len(res))
    except Exception as e:
        print("Failed:", e)


if __name__ == "__main__":
    test_duckdb_mvt_double()
