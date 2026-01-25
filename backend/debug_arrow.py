import duckdb
import pyarrow as pa
import io
import os

DATA_ROOT = "d:/project/lang/data"
data_type = "spoken_language"
dataset = "abrahammonpa"

dataset_path = os.path.join(DATA_ROOT, data_type, dataset)
lang_csv = os.path.join(dataset_path, "languages.csv").replace("\\", "/")
source_query = f"read_csv_auto('{lang_csv}')"

con = duckdb.connect()
try:
    # 1. Check raw count
    count = con.execute(f"SELECT count(*) FROM {source_query}").fetchone()[0]
    print(f"DuckDB Row Count: {count}")

    # 2. Get Arrow Table
    arrow_table = con.execute(f"SELECT * FROM {source_query}").fetch_arrow_table()
    print(f"Arrow Table Row Count: {arrow_table.num_rows}")
    print(f"Arrow Schema: {arrow_table.schema.names}")

    # 3. Simulate Stream
    sink = io.BytesIO()
    with pa.ipc.new_stream(sink, arrow_table.schema) as writer:
        writer.write_table(arrow_table)

    buf = sink.getvalue()
    print(f"Stream Buffer Size: {len(buf)} bytes")

    # 4. Try to read it back
    reader = pa.ipc.open_stream(io.BytesIO(buf))
    read_table = reader.read_all()
    print(f"Read-back Table Row Count: {read_table.num_rows}")

except Exception as e:
    print(f"ERROR: {e}")
finally:
    con.close()
