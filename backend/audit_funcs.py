import duckdb


def audit_functions():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    print("--- ST_AsMVTGeom Signatures ---")
    query = "SELECT parameter_types, return_type FROM duckdb_functions() WHERE name = 'st_asmvtgeom'"
    res = con.execute(query).fetchall()
    for r in res:
        print(r)

    print("\n--- ST_MakeEnvelope Signatures ---")
    query = "SELECT parameter_types, return_type FROM duckdb_functions() WHERE name = 'st_makeenvelope'"
    res = con.execute(query).fetchall()
    for r in res:
        print(r)

    print("\n--- Any function returning BOX_2D? ---")
    query = "SELECT name, parameter_types FROM duckdb_functions() WHERE return_type = 'BOX_2D'"
    res = con.execute(query).fetchall()
    for r in res:
        print(r)


if __name__ == "__main__":
    audit_functions()
