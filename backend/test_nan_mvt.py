import duckdb
import numpy as np


def test_mvt_nan():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute(
        "CREATE TABLE test AS SELECT ST_Point(0,0) AS geom, CAST('NaN' AS DOUBLE) as val"
    )

    print("Testing MVT with NaN property value...")
    try:
        res = con.execute(
            "SELECT ST_AsMVT(t, 'layer', 4096, 'geom') FROM test t"
        ).fetchone()
        print("Success! Data length:", len(res[0]) if res[0] else 0)
    except Exception as e:
        print("Crash detected:", e)


if __name__ == "__main__":
    test_mvt_nan()
