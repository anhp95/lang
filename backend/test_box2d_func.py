import duckdb


def test_duckdb_box2d_func():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    print("Testing BOX_2D function...")
    try:
        res = con.execute("SELECT BOX_2D(-180.0, -90.0, 180.0, 90.0)").fetchone()
        print("Success! BOX_2D output:", res[0])
    except Exception as e:
        print("Failed BOX_2D func:", e)

    print("\nTesting ST_AsMVTGeom with BOX_2D func...")
    try:
        query = """
        SELECT ST_AsMVTGeom(ST_Point(0,0), BOX_2D(-180.0, -90.0, 180.0, 90.0), 4096, 256, true)
        """
        res = con.execute(query).fetchall()
        print("Success ST_AsMVTGeom with BOX_2D")
    except Exception as e:
        print("Failed ST_AsMVTGeom with BOX_2D:", e)


if __name__ == "__main__":
    test_duckdb_box2d_func()
