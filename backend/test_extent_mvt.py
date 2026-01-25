import duckdb


def test_duckdb_extent_mvt():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    print("Testing ST_AsMVTGeom with ST_Extent subquery...")
    try:
        query = """
        SELECT ST_AsMVTGeom(
            ST_Point(0,0), 
            (SELECT ST_Extent(ST_MakeEnvelope(-180, -90, 180, 90))), 
            4096, 256, true
        )
        """
        res = con.execute(query).fetchall()
        print("Success! Multi-step tile generation works.")
    except Exception as e:
        print("Failed:", e)


if __name__ == "__main__":
    test_duckdb_extent_mvt()
