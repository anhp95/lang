import duckdb


def test_mvt_syntax():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, 1 AS id")

    print("Testing syntax 1: ST_AsMVT(t, 'layer', 4096, 'geom')")
    try:
        res = con.execute(
            "SELECT ST_AsMVT(t, 'layer', 4096, 'geom') FROM test t"
        ).fetchone()
        print("Success 1!")
    except Exception as e:
        print("Failed 1:", e)

    print("\nTesting syntax 2: ST_AsMVT(t.*, 'layer')")
    try:
        res = con.execute("SELECT ST_AsMVT(t.*, 'layer') FROM test t").fetchone()
        print("Success 2!")
    except Exception as e:
        print("Failed 2:", e)

    print("\nTesting syntax 3: ST_AsMVT(geom, 'layer')")
    try:
        res = con.execute("SELECT ST_AsMVT(geom, 'layer') FROM test").fetchone()
        print("Success 3!")
    except Exception as e:
        print("Failed 3:", e)


if __name__ == "__main__":
    test_mvt_syntax()
