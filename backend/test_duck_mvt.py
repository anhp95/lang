import duckdb


def test_duckdb_mvt():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute(
        "CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, 'a' AS name, 1 AS id"
    )
    con.execute("INSERT INTO test SELECT ST_Point(1,1) AS geom, 'b' AS name, 2 AS id")

    print("Testing aggregate style: ST_AsMVT(geom, 'layer')")
    try:
        # If this returns 1 row, it is an aggregate
        res = con.execute("SELECT ST_AsMVT(geom, 'layer') FROM test").fetchall()
        print(f"Rows: {len(res)}, Blob length: {len(res[0][0]) if res[0][0] else 0}")
    except Exception as e:
        print("Failed:", e)

    print("\nTesting row style: ST_AsMVT(t, 'layer')")
    try:
        res = con.execute(
            "SELECT ST_AsMVT(t, 'layer') FROM (SELECT geom, name FROM test) t"
        ).fetchall()
        print(f"Rows: {len(res)}")
    except Exception as e:
        print("Failed:", e)


if __name__ == "__main__":
    test_duckdb_mvt()
