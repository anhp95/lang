import duckdb

con = duckdb.connect()
con.execute("LOAD spatial;")
try:
    # Test 1: Aggregate syntax
    print("Testing Aggregate syntax...")
    res = con.execute(
        "SELECT ST_AsMVT(t, 'test') FROM (SELECT 1 as id, ST_Point(0,0) as geom) t"
    ).fetchone()
    print("Aggregate syntax SUCCESS")
except Exception as e:
    print(f"Aggregate syntax FAILED: {e}")

try:
    # Test 2: List logic (if it's a function taking a list of structs)
    print("\nTesting List logic...")
    res = con.execute(
        "SELECT ST_AsMVT(list(t), 'test') FROM (SELECT 1 as id, ST_Point(0,0) as geom) t"
    ).fetchone()
    print("List logic SUCCESS")
except Exception as e:
    print(f"List logic FAILED: {e}")

try:
    # Test 3: Standard aggregate with row()
    print("\nTesting row syntax...")
    res = con.execute(
        "SELECT ST_AsMVT(row(id, geom), 'test') FROM (SELECT 1 as id, ST_Point(0,0) as geom) t"
    ).fetchone()
    print("Row syntax SUCCESS")
except Exception as e:
    print(f"Row syntax FAILED: {e}")
