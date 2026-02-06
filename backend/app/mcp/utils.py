"""
MCP Shared Utilities

Centralized utilities for CSV validation, parsing, and LLM response handling.
Eliminates duplication across handlers.
"""

import csv
import io
import re
import json
from typing import Dict, List, Tuple, Any, Optional
import pandas as pd


# =============================================================================
# Constants
# =============================================================================

CORE_SCHEMA_COLUMNS = [
    "Glottocode",
    "Language Family",
    "Language Name",
    "Concept",
    "Form",
    "Latitude",
    "Longitude",
    "Source",
]

CORE_SCHEMA_LENGTH = 8

MAX_CSV_ROWS = 10000  # Prevent OOM on large files


# =============================================================================
# CSV Validation
# =============================================================================


def validate_core_schema(csv_data: str) -> Dict[str, Any]:
    """
    Validate CSV against the 8-column core linguistic schema.

    Returns:
        {
            "ok": bool,
            "errors": List[str],  # First 5 errors
            "warnings": List[str],
            "row_count": int,
            "is_core_schema": bool
        }
    """
    if not csv_data or not csv_data.strip():
        return {
            "ok": False,
            "errors": ["Empty CSV data"],
            "warnings": [],
            "row_count": 0,
            "is_core_schema": False,
        }

    errors = []
    warnings = []

    try:
        input_stream = io.StringIO(csv_data.strip())
        reader = csv.reader(input_stream)

        header = next(reader, None)
        if not header:
            return {
                "ok": False,
                "errors": ["No header row"],
                "warnings": [],
                "row_count": 0,
                "is_core_schema": False,
            }

        # Detect if this is core schema
        is_core_schema = len(header) == CORE_SCHEMA_LENGTH and "Glottocode" in header

        if not is_core_schema:
            # Not core schema - skip strict validation
            return {
                "ok": True,
                "errors": [],
                "warnings": [],
                "row_count": -1,
                "is_core_schema": False,
            }

        # Validate column names
        missing = [col for col in CORE_SCHEMA_COLUMNS if col not in header]
        if missing:
            errors.append(f"Missing columns: {', '.join(missing)}")

        # Validate row lengths
        line_num = 2  # 1-indexed, header is line 1
        row_count = 0

        for row in reader:
            if row_count >= MAX_CSV_ROWS:
                warnings.append(
                    f"File exceeds {MAX_CSV_ROWS} rows, truncated for validation"
                )
                break

            if len(row) != CORE_SCHEMA_LENGTH:
                errors.append(
                    f"Line {line_num}: has {len(row)} fields instead of {CORE_SCHEMA_LENGTH}"
                )
                if len(errors) >= 5:
                    break

            line_num += 1
            row_count += 1

        return {
            "ok": len(errors) == 0,
            "errors": errors[:5],
            "warnings": warnings,
            "row_count": row_count,
            "is_core_schema": True,
        }

    except Exception as e:
        return {
            "ok": False,
            "errors": [str(e)],
            "warnings": [],
            "row_count": 0,
            "is_core_schema": False,
        }


def parse_csv_safe(csv_data: str) -> Tuple[Optional[pd.DataFrame], List[str]]:
    """
    Parse CSV safely, returning (DataFrame, errors) tuple.
    Does NOT auto-repair. Use normalize() first if needed.
    """
    errors = []

    if not csv_data or not csv_data.strip():
        return None, ["Empty CSV data"]

    try:
        df = pd.read_csv(io.StringIO(csv_data))
        return df, []
    except Exception as e:
        return None, [str(e)]


# =============================================================================
# CSV Repair (Normalization)
# =============================================================================


def repair_csv(csv_data: str) -> Tuple[str, List[str]]:
    """
    Repair and normalize CSV data for core schema.

    Returns:
        (repaired_csv, warnings)
    """
    if not csv_data or not csv_data.strip():
        return "", ["Empty CSV data"]

    warnings = []

    try:
        input_stream = io.StringIO(csv_data.strip())

        # Detect delimiter
        try:
            dialect = csv.Sniffer().sniff(csv_data[:1024])
        except:
            dialect = "excel"

        reader = csv.reader(input_stream, dialect=dialect)
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        header = next(reader, None)
        if not header:
            return "", ["No header row"]

        # Normalize header
        if len(header) < CORE_SCHEMA_LENGTH:
            header.extend([""] * (CORE_SCHEMA_LENGTH - len(header)))
            warnings.append("Added missing header columns")
        header = [c.strip() for c in header[:CORE_SCHEMA_LENGTH]]
        writer.writerow(header)

        row_count = 0
        for row in reader:
            if row_count >= MAX_CSV_ROWS:
                warnings.append(f"Truncated at {MAX_CSV_ROWS} rows")
                break

            # 1. Normalize length
            if len(row) < CORE_SCHEMA_LENGTH:
                row.extend([""] * (CORE_SCHEMA_LENGTH - len(row)))
            elif len(row) > CORE_SCHEMA_LENGTH:
                # Merge extra into Source column
                source = ", ".join(row[7:])
                row = row[:7] + [source]
                warnings.append(
                    f"Row {row_count + 2}: merged extra columns into Source"
                )

            # 2. Trim whitespace
            row = [c.strip() for c in row]

            # 3. Coordinate hygiene (indices 5=Lat, 6=Lon)
            for i in [5, 6]:
                if row[i]:
                    cleaned = _clean_coordinate(row[i])
                    if cleaned is None:
                        row[i] = ""
                    else:
                        row[i] = cleaned

            writer.writerow(row)
            row_count += 1

        return output.getvalue(), warnings

    except Exception as e:
        return csv_data, [f"Repair failed: {str(e)}"]


def _clean_coordinate(value: str) -> Optional[str]:
    """Clean a coordinate value, returning None if invalid."""
    if not value:
        return None

    # Remove common artifacts
    cleaned = value
    for char in ["°", "′", "″", "N", "S", "E", "W", " "]:
        cleaned = cleaned.replace(char, "")

    # Handle negative for S/W
    if "S" in value.upper() or "W" in value.upper():
        if not cleaned.startswith("-"):
            cleaned = "-" + cleaned

    try:
        float(cleaned)
        return cleaned
    except ValueError:
        return None


# =============================================================================
# LLM Response Parsing
# =============================================================================


def extract_json_array(text: str) -> Optional[List[str]]:
    """
    Extract a JSON array from LLM response text.
    Returns None if not found or invalid.
    """
    if not text:
        return None

    # Try to find JSON array
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group(0))
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    return None


def clean_llm_response(text: str) -> str:
    """
    Remove tool call JSON blocks from LLM response.
    """
    if not text:
        return ""

    # Remove JSON code blocks
    cleaned = re.sub(r"```(?:json)?\s*\{[^`]*\}\s*```", "", text, flags=re.DOTALL)

    # Remove inline JSON with server/tool
    cleaned = re.sub(r'\{"server"[^}]*\}', "", cleaned)

    # Remove orphaned code block markers
    cleaned = re.sub(r"```\s*```", "", cleaned)
    cleaned = re.sub(r"```\s*\n\s*```", "", cleaned)

    # Collapse multiple newlines
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    return cleaned.strip()
