import duckdb


def test_mvt_aggregation():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, 1 AS id")
    con.execute("INSERT INTO test SELECT ST_Point(0.1, 0.1) AS geom, 2 AS id")

    print(
        "Testing aggregate behavior: SELECT count(*) FROM (SELECT ST_AsMVT(t, 'layer', 4096, 'geom') FROM test t)"
    )
    try:
        res = con.execute(
            "SELECT ST_AsMVT(t, 'layer', 4096, 'geom') FROM test t"
        ).fetchall()
        print(f"Number of rows returned: {len(res)}")
        if len(res) == 1:
            print("It is an AGGREGATE function.")
        else:
            print("It is a SCALAR function (unexpected).")
    except Exception as e:
        print("Error during test:", e)


if __name__ == "__main__":
    test_mvt_aggregation()
