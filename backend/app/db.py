import duckdb
import os

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "research_platform.duckdb"
)


def get_db_connection():
    # Use spatial extension
    con = duckdb.connect(DB_PATH)
    return con


def init_db():
    print(f"Initializing DuckDB at {DB_PATH}")
    con = get_db_connection()
    try:
        con.execute("INSTALL spatial; LOAD spatial;")
        print("Spatial extension loaded and database ready for dynamic queries.")
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        con.close()
