import os
import pandas as pd
import duckdb
from pathlib import Path
import random
import json


def get_db_connection():
    DB_PATH = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "research_platform.duckdb"
    )
    con = duckdb.connect(DB_PATH)
    return con


def load_cldf_data():
    """Load CLDF language data from all subdirectories"""
    print("Loading CLDF data...")
    con = get_db_connection()

    try:
        # Load spatial extension
        con.execute("INSTALL spatial; LOAD spatial;")

        # Create languages table
        con.execute("""
            CREATE TABLE IF NOT EXISTS languages (
                id VARCHAR,
                name VARCHAR,
                latitude DOUBLE,
                longitude DOUBLE,
                family VARCHAR,
                dataset VARCHAR,
                geom GEOMETRY
            )
        """)

        # Load data from each CLDF dataset
        data_dir = Path(
            os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "..", "data", "cldf"
            )
        )

        for dataset_dir in data_dir.iterdir():
            if dataset_dir.is_dir():
                languages_file = dataset_dir / "languages.csv"
                if languages_file.exists():
                    print(f"Loading {dataset_dir.name}...")
                    df = pd.read_csv(languages_file)

                    # Add dataset name
                    df["dataset"] = dataset_dir.name

                    # Insert into database
                    for _, row in df.iterrows():
                        if pd.notna(row.get("Latitude")) and pd.notna(
                            row.get("Longitude")
                        ):
                            con.execute(
                                """
                                INSERT INTO languages (id, name, latitude, longitude, family, dataset, geom)
                                VALUES (?, ?, ?, ?, ?, ?, ST_Point(?, ?))
                            """,
                                [
                                    row.get("ID", ""),
                                    row.get("Name", ""),
                                    row.get("Latitude"),
                                    row.get("Longitude"),
                                    row.get("Family", ""),
                                    dataset_dir.name,
                                    row.get("Longitude"),
                                    row.get("Latitude"),
                                ],
                            )

        print(
            f"Loaded {con.execute('SELECT COUNT(*) FROM languages').fetchone()[0]} languages"
        )

    except Exception as e:
        print(f"Error loading CLDF data: {e}")
    finally:
        con.close()


def generate_synthetic_data():
    """Generate synthetic archaeology and genetics data"""
    print("Generating synthetic data...")
    con = get_db_connection()

    try:
        # Load spatial extension
        con.execute("INSTALL spatial; LOAD spatial;")

        # Create synthetic sites table
        con.execute("""
            CREATE TABLE IF NOT EXISTS sites (
                id VARCHAR,
                name VARCHAR,
                type VARCHAR, -- 'archaeology' or 'genetics'
                latitude DOUBLE,
                longitude DOUBLE,
                description TEXT,
                media_url VARCHAR,
                date_discovered VARCHAR,
                geom GEOMETRY
            )
        """)

        # Get existing language points for reference
        lang_points = con.execute(
            "SELECT latitude, longitude FROM languages"
        ).fetchall()

        if not lang_points:
            print("No language points found, skipping synthetic data generation")
            return

        site_types = ["archaeology", "genetics"]
        site_count = 0

        for i, (lat, lon) in enumerate(lang_points[:50]):  # Limit to 50 sites for demo
            # Generate 1-3 sites near each language point
            num_sites = random.randint(1, 3)

            for j in range(num_sites):
                # Add random offset (within ~50km)
                lat_offset = random.uniform(-0.5, 0.5)
                lon_offset = random.uniform(-0.5, 0.5)

                site_lat = lat + lat_offset
                site_lon = lon + lon_offset

                site_type = random.choice(site_types)
                site_id = f"{site_type}_{i}_{j}"

                # Generate mock media URL
                media_url = f"https://picsum.photos/400/300?random={site_count}"

                con.execute(
                    """
                    INSERT INTO sites (id, name, type, latitude, longitude, description, media_url, date_discovered, geom)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ST_Point(?, ?))
                """,
                    [
                        site_id,
                        f"{site_type.title()} Site {site_count + 1}",
                        site_type,
                        site_lat,
                        site_lon,
                        f"Mock {site_type} site near language point {i}",
                        media_url,
                        f"2024-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
                        site_lon,
                        site_lat,
                    ],
                )

                site_count += 1

        print(f"Generated {site_count} synthetic sites")

    except Exception as e:
        print(f"Error generating synthetic data: {e}")
    finally:
        con.close()


if __name__ == "__main__":
    load_cldf_data()
    generate_synthetic_data()
