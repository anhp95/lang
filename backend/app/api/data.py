from fastapi import APIRouter, HTTPException, Query, Response
from app.db import get_db_connection
import os
from typing import Optional
import numpy as np
import pyarrow as pa
import io

router = APIRouter()

DATA_ROOT = "d:/project/lang/data"


def sanitize_df(df):
    """
    Robustly convert NaN/Inf/NaT to None for JSON compliance.
    """
    return [
        {
            k: (
                v
                if v is not np.nan
                and v == v
                and not (isinstance(v, float) and np.isinf(v))
                else None
            )
            for k, v in row.items()
        }
        for row in df.to_dict(orient="records")
    ]


@router.get("/catalog")
async def get_catalog():
    catalog = {
        "spoken_language": [],
        "sign_language": [],
        "archaeology": [],
        "genetics": [],
    }
    con = get_db_connection()
    try:
        for data_type in catalog.keys():
            type_dir = os.path.join(DATA_ROOT, data_type)
            if os.path.exists(type_dir):
                dirs = [
                    d
                    for d in os.listdir(type_dir)
                    if os.path.isdir(os.path.join(type_dir, d))
                ]
                for d in dirs:
                    dataset_path = os.path.join(type_dir, d)
                    count = 0
                    try:
                        if data_type in ["spoken_language", "sign_language"]:
                            lang_csv = os.path.join(
                                dataset_path, "languages.csv"
                            ).replace("\\", "/")
                            if os.path.exists(lang_csv):
                                count = con.execute(
                                    f"SELECT count(*) FROM read_csv_auto('{lang_csv}')"
                                ).fetchone()[0]
                        else:
                            csv_file = os.path.join(
                                dataset_path, f"{data_type}.csv"
                            ).replace("\\", "/")
                            if os.path.exists(csv_file):
                                count = con.execute(
                                    f"SELECT count(*) FROM read_csv_auto('{csv_file}')"
                                ).fetchone()[0]
                    except Exception:
                        pass
                    catalog[data_type].append({"name": d, "count": count})
        return catalog
    finally:
        con.close()


@router.get("/schema")
async def get_schema(data_type: str, dataset: str):
    dataset_path = os.path.join(DATA_ROOT, data_type, dataset)
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found")
    con = get_db_connection()
    try:
        source_query = ""
        if data_type in ["spoken_language", "sign_language"]:
            lang_csv = os.path.join(dataset_path, "languages.csv").replace("\\", "/")
            forms_csv = os.path.join(dataset_path, "forms.csv").replace("\\", "/")
            params_csv = os.path.join(dataset_path, "parameters.csv").replace("\\", "/")
            if all(os.path.exists(f) for f in [lang_csv, forms_csv, params_csv]):
                source_query = f"""
                (
                    SELECT l.*, f.Value as form_value, p.Name as parameter_name
                    FROM read_csv_auto('{lang_csv}') l
                    JOIN read_csv_auto('{forms_csv}') f ON l.ID = f.Language_ID
                    JOIN read_csv_auto('{params_csv}') p ON f.Parameter_ID = p.ID
                    LIMIT 0
                )
                """
            else:
                source_query = f"read_csv_auto('{lang_csv}') LIMIT 0"
        else:
            csv_file = os.path.join(dataset_path, f"{data_type}.csv").replace("\\", "/")
            source_query = f"read_csv_auto('{csv_file}') LIMIT 0"

        schema_df = con.execute(f"DESCRIBE SELECT * FROM {source_query}").df()
        columns = []
        for _, row in schema_df.iterrows():
            col_name = str(row["column_name"])
            col_type = str(row["column_type"]).lower()
            if any(
                t in col_type for t in ["int", "float", "double", "decimal", "hugeint"]
            ):
                v_type = "numerical"
            else:
                v_type = "categorical"
            columns.append({"name": col_name, "type": v_type, "raw_type": col_type})
        return {"columns": columns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()


@router.get("/data")
async def get_data(
    data_type: str,
    dataset: str,
    search: Optional[str] = Query(None),
    form_filter: Optional[str] = Query(None),
    parameter_filter: Optional[str] = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
):
    dataset_path = os.path.join(DATA_ROOT, data_type, dataset)
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found")
    con = get_db_connection()
    try:
        source_query = ""
        if data_type in ["spoken_language", "sign_language"]:
            lang_csv = os.path.join(dataset_path, "languages.csv").replace("\\", "/")
            forms_csv = os.path.join(dataset_path, "forms.csv").replace("\\", "/")
            params_csv = os.path.join(dataset_path, "parameters.csv").replace("\\", "/")
            source_query = f"read_csv_auto('{lang_csv}')"
            if form_filter or parameter_filter:
                source_query = f"""
                (
                    SELECT l.*, f.Value as form_value, p.Name as parameter_name
                    FROM read_csv_auto('{lang_csv}') l
                    JOIN read_csv_auto('{forms_csv}') f ON l.ID = f.Language_ID
                    JOIN read_csv_auto('{params_csv}') p ON f.Parameter_ID = p.ID
                )
                """
            conds = ["1=1"]
            if search:
                conds.append(f"LOWER(Name) LIKE LOWER('%{search}%')")
            if form_filter:
                conds.append(f"LOWER(form_value) LIKE LOWER('%{form_filter}%')")
            if parameter_filter:
                conds.append(
                    f"LOWER(parameter_name) LIKE LOWER('%{parameter_filter}%')"
                )
            where = " AND ".join(conds)
            query = f"SELECT * FROM {source_query} WHERE {where} LIMIT {limit} OFFSET {offset}"
            count_query = f"SELECT count(*) FROM {source_query} WHERE {where}"
        else:
            csv_file = os.path.join(dataset_path, f"{data_type}.csv").replace("\\", "/")
            conds = ["1=1"]
            if search:
                conds.append(
                    f"(LOWER(Name) LIKE LOWER('%{search}%') OR LOWER(Description) LIKE LOWER('%{search}%'))"
                )
            where = " AND ".join(conds)
            query = f"SELECT * FROM read_csv_auto('{csv_file}') WHERE {where} LIMIT {limit} OFFSET {offset}"
            count_query = (
                f"SELECT count(*) FROM read_csv_auto('{csv_file}') WHERE {where}"
            )

        df = con.execute(query).df()
        results = sanitize_df(df)
        total = con.execute(count_query).fetchone()[0]
        return {"data": results, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()


@router.get("/full_data")
async def get_full_data(data_type: str, dataset: str):
    dataset_path = os.path.join(DATA_ROOT, data_type, dataset)
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found")
    con = get_db_connection()
    try:
        source_query = ""
        if data_type in ["spoken_language", "sign_language"]:
            lang_csv = os.path.join(dataset_path, "languages.csv").replace("\\", "/")
            source_query = f"read_csv_auto('{lang_csv}')"
        else:
            csv_file = os.path.join(dataset_path, f"{data_type}.csv").replace("\\", "/")
            source_query = f"read_csv_auto('{csv_file}')"

        # Stream full dataset without artificial limits for client-side rendering
        df = con.execute(f"SELECT * FROM {source_query}").df()
        results = sanitize_df(df)
        return {"data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()


@router.get("/arrow_data")
async def get_arrow_data(data_type: str, dataset: str):
    dataset_path = os.path.join(DATA_ROOT, data_type, dataset)
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found")
    con = get_db_connection()
    try:
        source_query = ""
        if data_type in ["spoken_language", "sign_language"]:
            lang_csv = os.path.join(dataset_path, "languages.csv").replace("\\", "/")
            source_query = f"read_csv_auto('{lang_csv}')"
        else:
            csv_file = os.path.join(dataset_path, f"{data_type}.csv").replace("\\", "/")
            source_query = f"read_csv_auto('{csv_file}')"

        # Export to Apache Arrow Table
        arrow_table = con.execute(f"SELECT * FROM {source_query}").fetch_arrow_table()

        # Serialize to IPC Stream format
        sink = io.BytesIO()
        with pa.ipc.new_stream(sink, arrow_table.schema) as writer:
            writer.write_table(arrow_table)

        return Response(
            content=sink.getvalue(), media_type="application/vnd.apache.arrow.stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()
