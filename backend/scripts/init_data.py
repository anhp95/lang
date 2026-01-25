import duckdb
import os
import glob
import random

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "research_platform.duckdb"
)
CLDF_ROOT = "d:/project/lang/data/cldf"


def init_tables(con):
    con.execute(
        """
    CREATE TABLE IF NOT EXISTS languages (
        id VARCHAR,
        name VARCHAR,
        latitude DOUBLE,
        longitude DOUBLE,
        family VARCHAR,
        dataset VARCHAR,
        geom GEOMETRY
    );
    """
    )
    con.execute(
        """
    CREATE TABLE IF NOT EXISTS sites (
        id VARCHAR,
        name VARCHAR,
        type VARCHAR,
        latitude DOUBLE,
        longitude DOUBLE,
        description VARCHAR,
        media_url VARCHAR,
        geom GEOMETRY
    );
    """
    )


def ingest_cldf(con):
    print("Scanning CLDF datasets...")
    files = glob.glob(os.path.join(CLDF_ROOT, "**", "languages.csv"), recursive=True)
    print(f"Found {len(files)} languages.csv files.")

    count = 0
    for file in files:
        try:
            # Use DuckDB native CSV reader
            # We select specific columns. We cast them to handle any type mismatch.
            # We filter out rows where Lat/Lon is null
            dataset_name = os.path.basename(os.path.dirname(file))
            file = file.replace("\\", "/")  # Ensure forward slashes for SQL

            query = f"""
            INSERT INTO languages (id, name, latitude, longitude, dataset, geom)
            SELECT 
                CAST(ID AS VARCHAR), 
                CAST(Name AS VARCHAR), 
                CAST(Latitude AS DOUBLE), 
                CAST(Longitude AS DOUBLE),
                '{dataset_name}',
                ST_Point(CAST(Longitude AS DOUBLE), CAST(Latitude AS DOUBLE))
            FROM read_csv_auto('{file}', header=True)
            WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL
            """
            con.execute(query)
            # count += con.rowcount # rowcount might not be reliable in all drivers, but let's assume it works or ignore count
        except Exception as e:
            # print(f"Skipping {file}: {e}")
            pass

    # Verify count
    c = con.execute("SELECT count(*) FROM languages").fetchone()[0]
    print(f"Total Ingsted Languages: {c}")


def ingest_synthetic_sites(con):
    print("Generating synthetic sites...")
    # Use direct SQL insert for robustness

    # We can generate a CSV and load it, OR just insert in a loop (slow but fine for 1000),
    # OR generate in SQL with generate_series!

    query = """
    INSERT INTO sites (id, name, type, latitude, longitude, description, media_url, geom)
    SELECT
        'site_' || i AS id,
        'Site ' || i || ' (' || (CASE WHEN i % 2 = 0 THEN 'archaeology' ELSE 'genetics' END) || ')' AS name,
        CASE WHEN i % 2 = 0 THEN 'archaeology' ELSE 'genetics' END AS type,
        (random() * 120 - 50) AS latitude,
        (random() * 360 - 180) AS longitude,
        'Auto-generated site' AS description,
        'https://picsum.photos/seed/' || i || '/300/200' AS media_url,
        ST_Point((random() * 360 - 180), (random() * 120 - 50)) AS geom
    FROM generate_series(0, 1000) AS t(i);
    """
    con.execute(query)

    c = con.execute("SELECT count(*) FROM sites").fetchone()[0]
    print(f"Total Synthetic Sites: {c}")


if __name__ == "__main__":
    con = duckdb.connect(DB_PATH)
    try:
        con.execute("INSTALL spatial; LOAD spatial;")
        init_tables(con)

        con.execute("DELETE FROM languages")
        con.execute("DELETE FROM sites")

        ingest_cldf(con)
        ingest_synthetic_sites(con)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        con.close()
