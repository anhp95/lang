"""
MCP Tool Handlers

Implementations for each MCP server tool.
These are the actual functions that execute when tools are called.
"""

import csv
import io
import json
from typing import Dict, List, Optional, Any

import pandas as pd
import numpy as np

from app.mcp.utils import (
    validate_core_schema,
    repair_csv,
    extract_json_array,
)


# ============================================================================
# Server 1: wordlist_discovery
# ============================================================================


async def propose_wordlist(
    topic: str, constraints: Optional[Dict] = None, llm_call_fn=None, **kwargs
) -> Dict[str, Any]:
    """
    Generate a wordlist for a given topic using LLM.

    Returns:
        {"wordlist": [...], "notes": "..."}
    """
    # Handle LLM hallucinations (sometimes they put max_terms/num_words at top level)
    max_terms = 30
    if constraints and "max_terms" in constraints:
        max_terms = constraints["max_terms"]
    elif "num_words" in kwargs:
        max_terms = kwargs["num_words"]
    elif "max_terms" in kwargs:
        max_terms = kwargs["max_terms"]

    region = constraints.get("region") if constraints else kwargs.get("region")
    domain = constraints.get("domain") if constraints else kwargs.get("domain")

    # Build prompt
    prompt = f"""Generate a wordlist of {max_terms} concepts for the semantic field: "{topic}"

Requirements:
- Concepts should be culturally universal and semantically basic
- Focus on terms likely to be well-documented across languages
- Each concept should be distinct and clearly defined
- Suitable for cross-linguistic comparison

{f'Geographic focus: {region}' if region else ''}
{f'Domain focus: {domain}' if domain else ''}

Return ONLY a JSON array of strings, nothing else:
["concept1", "concept2", ...]"""

    if llm_call_fn:
        try:
            response = await llm_call_fn(prompt)
            if not response:
                return {
                    "wordlist": [],
                    "error": "LLM returned an empty response",
                    "notes": "Failed to generate wordlist",
                }

            # Extract JSON array using shared utility
            wordlist = extract_json_array(response)
            if wordlist is not None:
                return {
                    "wordlist": wordlist,
                    "notes": f"Generated {len(wordlist)} concepts for {topic}",
                }
            else:
                return {
                    "wordlist": [],
                    "error": "No JSON list found in LLM response",
                    "notes": response[:100],
                }
        except Exception as e:
            return {
                "wordlist": [],
                "error": f"LLM call failed: {str(e)}",
                "notes": "Internal error",
            }

    return {
        "wordlist": [],
        "error": "LLM call function not provided",
        "notes": "Configuration error",
    }


async def refine_wordlist(
    wordlist: List[str], feedback: str, llm_call_fn=None, **kwargs
) -> Dict[str, Any]:
    """
    Refine an existing wordlist based on user feedback.
    """
    prompt = f"""Current wordlist: {json.dumps(wordlist)}

User feedback: {feedback}

Modify the wordlist according to the feedback. Return ONLY a JSON array:
["concept1", "concept2", ...]"""

    if llm_call_fn:
        response = await llm_call_fn(prompt)
        result = extract_json_array(response)
        if result is not None:
            return {"wordlist": result}

    return {"wordlist": wordlist}


# ============================================================================
# Server 2: linguistic_web_harvester
# ============================================================================


async def collect_multilingual_rows(
    wordlist: List[str], scope: Optional[Dict] = None, llm_call_fn=None, **kwargs
) -> Dict[str, Any]:
    """
    Generate an LLM prompt for collecting multilingual data.
    Returns the search prompt (actual web search would be implemented separately).
    """
    try:
        wordlist_str = ", ".join(wordlist)
        print(wordlist_str)

        scope_text = ""
        # Handle flattened scope parameters from LLM
        final_scope = scope or {}
        if not final_scope:
            if "language_families" in kwargs:
                final_scope["language_families"] = kwargs["language_families"]
            if "regions" in kwargs:
                final_scope["regions"] = kwargs["regions"]
            if "max_languages" in kwargs:
                final_scope["max_languages"] = kwargs["max_languages"]

        if final_scope:
            if final_scope.get("language_families"):
                scope_text += f"\nFocus on language families: {', '.join(final_scope['language_families'])}"
            if final_scope.get("regions"):
                scope_text += f"\nFocus on regions: {', '.join(final_scope['regions'])}"
            if final_scope.get("max_languages"):
                scope_text += (
                    f"\nLimit to approximately {final_scope['max_languages']} languages"
                )

        prompt = f"""Task: Collect multilingual linguistic data for the following concepts:
{wordlist_str}
{scope_text}

### Linguistic Search & Coverage Rules (Generalized for Any Wordlist)

For each target **word or concept** in the user-provided wordlist, the primary objective is to identify **corresponding lexical forms** expressing the same concept in **as many languages as possible**.

1. **Lexical Form Discovery (Primary Objective)**
   - Actively search for **attested lexical forms** that correspond to the target word or concept, including:
     - Cognates
     - Inherited forms
     - Loanwords
     - Calques
     - Closely related or semantically equivalent lexical items
   - The focus is on **lexical realization**, not orthographic similarity alone.
   - Include culturally specific variants that encode the same concept, even when the surface form differs substantially.

2. **Priority Scope**
   - Identify language families and geographic regions where the target concept is:
     - Historically attested
     - Culturally significant
     - Frequently documented in linguistic or ethnographic literature
   - Prioritize these regions and families to maximize coverage of relevant lexical forms.

3. **Global Expansion**
   - After covering priority regions, expand the search to **all other languages with reliable documentation**, aiming for **maximal cross-linguistic coverage**.
   - Include both historical and contemporary lexical data when available.

4. **Per-Row Information Requirement (Force-fill with Strict Geospatial Validation)**
   - For every **(Language × Concept × Lexical Form)**, you MUST attempt to retrieve:
     - Glottocode (from Glottolog)
     - Language Family (Glottolog classification)
     - Standardized Language Name (Glottolog)
     - Concept (from the wordlist)
     - **Form (the attested lexical form expressing the concept)**
     - **Latitude and Longitude (see rules below)**
     - Source (dictionary, grammar, database, or ethnographic reference)

   - **Coordinate Rules (CRITICAL):**
     - Latitude and Longitude MUST be provided for every row.
     - Coordinates MUST correspond to a **real, mappable geographic location** and be valid for map visualization.
     - **Primary source:** Glottolog language-level coordinates.
     - **Fallback:** if language-level coordinates are unavailable, use a **standardized country-level reference point** for the primary country where the language is spoken.
       - The country reference must come from an authoritative dataset (e.g., ISO country centroids, Natural Earth, or equivalent).
       - The same country must always resolve to the same coordinates.
     - **Do NOT**:
       - Generate random coordinates
       - Use arbitrary offsets or noise
       - Guess from vague regional descriptions
       - Use placeholder or dummy values (e.g., `0`, `1`, `999`)
     - Coordinates must satisfy:
       - Latitude ∈ [-90, 90]
       - Longitude ∈ [-180, 180]
       - Numeric and finite values only

   - Do not output a row unless a **Source** is available.
   - Never guess or invent linguistic data.
   - Geographic estimation is allowed **only** under the controlled fallback rules above.

5. **Output Format (STRICT CSV)**
   - Output **only CSV**, UTF-8 encoded.
   - Columns must appear in this exact order:
     ```
     Glottocode,Language Family,Language Name,Concept,Form,Latitude,Longitude,Source
     ```
   - One row per (Language × Concept × Lexical Form).
   - Any field containing commas, quotes, or newlines (especially `Language Name` and `Source`) MUST be wrapped in double quotes.
   - Internal double quotes must be escaped as `""`.
   - Start with the header row, then data rows.
   - Do not include explanations, markdown, or extra text.

**Goal:** produce a **maximally comprehensive, geographically valid, and schema-strict cross-linguistic inventory of corresponding lexical forms**, suitable for direct computational analysis and accurate map visualization.
"""

        if llm_call_fn:
            csv_result = await llm_call_fn(prompt)
            return {
                "csv": csv_result,
                "prompt": prompt,
                "wordlist": wordlist,
                "notes": f"Collected data for {len(wordlist)} concepts",
            }

        return {
            "prompt": prompt,
            "wordlist": wordlist,
            "notes": "LLM function not available - returning prompt only",
        }
    except Exception as e:
        return {"error": str(e), "csv": "", "prompt": ""}


# ============================================================================
# Server 3: csv_ingest_and_validate
# ============================================================================


def read_csv(csv_data: str) -> Dict[str, Any]:
    """Parse CSV and return table structure. Does NOT auto-repair."""
    try:
        # Validate first
        validation = validate_core_schema(csv_data)
        if validation["is_core_schema"] and not validation["ok"]:
            return {
                "columns": [],
                "row_count": 0,
                "preview": [],
                "error": f"CSV has structural issues: {'; '.join(validation['errors'][:3])}. Run 'normalize' first.",
                "needs_normalize": True,
            }

        df = pd.read_csv(io.StringIO(csv_data))
        return {
            "columns": list(df.columns),
            "row_count": len(df),
            "preview": df.head(5).to_dict(orient="records"),
        }
    except Exception as e:
        return {"columns": [], "row_count": 0, "preview": [], "error": str(e)}


def validate_schema(
    csv_data: str, required_columns: List[str] = None
) -> Dict[str, Any]:
    """Validate CSV has required columns and proper structure."""
    # Use shared validation for structure
    validation = validate_core_schema(csv_data)

    errors = list(validation.get("errors", []))
    warnings = list(validation.get("warnings", []))

    try:
        df = pd.read_csv(io.StringIO(csv_data))

        # Column Check (if required_columns provided)
        if required_columns:
            existing = set(df.columns)
            required_set = set(required_columns)
            missing = required_set - existing
            extra = existing - required_set

            for col in missing:
                errors.append(f"Missing required column: {col}")
            for col in extra:
                warnings.append(f"Extra column: {col}")

            # Structure Check
            if len(df.columns) != 8 and "Glottocode" in required_columns:
                warnings.append(f"Expected 8 columns, found {len(df.columns)}")

        return {
            "ok": len(errors) == 0,
            "errors": errors[:5],  # Report first 5 errors
            "warnings": warnings,
            "total_errors": len(errors),
            "row_count": len(df),
        }
    except Exception as e:
        return {"ok": False, "errors": [str(e)], "warnings": [], "total_errors": 1}


def normalize(csv_data: str) -> Dict[str, Any]:
    """
    Repair and normalize CSV formatting.
    Ensures correct escaping, row lengths, and coordinate hygiene.

    Returns:
        {"csv": str, "warnings": List[str], "row_count": int}
    """
    repaired, warnings = repair_csv(csv_data)
    row_count = repaired.count("\n") - 1 if repaired else 0
    return {
        "csv": repaired,
        "warnings": warnings,
        "row_count": max(0, row_count),
    }


# ============================================================================
# Server 4: availability_matrix
# ============================================================================


def to_binary_matrix(csv_data: str) -> Dict[str, Any]:
    """
    Convert linguistic rows to binary availability matrix.
    """
    try:
        # Validation gate using shared utility
        validation = validate_core_schema(csv_data)
        if validation["is_core_schema"] and not validation["ok"]:
            errors = "; ".join(validation["errors"][:3])
            return {
                "csv": "",
                "error": f"CSV Structure Error: {errors}. Please run the 'normalize' tool to fix this automatically.",
                "summary": {},
            }

        df = pd.read_csv(io.StringIO(csv_data))

        # Verify required columns
        required = ["Glottocode", "Language Name", "Concept", "Form"]
        missing = [col for col in required if col not in df.columns]
        if missing:
            return {"csv": "", "error": f"Missing columns: {missing}", "summary": {}}

        # Remove empty forms
        df = df.dropna(subset=["Form"])
        df = df[df["Form"].astype(str).str.strip() != ""]

        # Create presence indicator
        df["has_form"] = 1

        # Get metadata columns that exist
        meta_cols = [
            "Glottocode",
            "Language Family",
            "Language Name",
            "Latitude",
            "Longitude",
        ]
        meta_cols = [c for c in meta_cols if c in df.columns]

        # Pivot to binary matrix
        grouped = df.groupby(meta_cols + ["Concept"])["has_form"].first().reset_index()
        matrix = grouped.pivot_table(
            index=meta_cols, columns="Concept", values="has_form", fill_value=0
        ).reset_index()

        # Ensure concept columns are integers
        concept_cols = [c for c in matrix.columns if c not in meta_cols]
        for col in concept_cols:
            matrix[col] = matrix[col].astype(int)

        csv_output = matrix.to_csv(index=False)

        return {
            "csv": csv_output,
            "summary": {
                "languages": len(matrix),
                "concepts": len(concept_cols),
                "avg_coverage": float(
                    round(matrix[concept_cols].mean().mean() * 100, 1)
                ),
            },
        }
    except Exception as e:
        return {"csv": "", "error": str(e), "summary": {}}


# ============================================================================
# Server 5: clustering_hdbscan
# ============================================================================


def cluster(csv_data: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Cluster languages using HDBSCAN.

    Input: Binary matrix CSV
    Output: Same CSV with cluster_id column added
    """
    try:
        import hdbscan

        params = params or {}
        min_cluster_size = params.get("min_cluster_size", 5)
        min_samples = params.get("min_samples", 3)
        metric = params.get("metric", "jaccard")

        df = pd.read_csv(io.StringIO(csv_data))

        # Identify metadata vs concept columns
        meta_cols = [
            "Glottocode",
            "Language Family",
            "Language Name",
            "Latitude",
            "Longitude",
        ]
        meta_cols = [c for c in meta_cols if c in df.columns]
        concept_cols = [c for c in df.columns if c not in meta_cols]

        if not concept_cols:
            return {"csv": "", "error": "No concept columns found", "summary": {}}

        # Extract feature matrix
        X = df[concept_cols].values

        # Cluster
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric=metric,
            cluster_selection_method="eom",
        )
        labels = clusterer.fit_predict(X)

        # Add cluster column
        df["cluster_id"] = labels

        # Summary
        n_clusters = int(len(set(labels)) - (1 if -1 in labels else 0))
        n_noise = int(sum(labels == -1))

        return {
            "csv": df.to_csv(index=False),
            "summary": {
                "total_clusters": n_clusters,
                "clustered_languages": int(len(labels) - n_noise),
                "noise_points": n_noise,
            },
        }
    except ImportError:
        return {"csv": "", "error": "hdbscan not installed", "summary": {}}
    except Exception as e:
        return {"csv": "", "error": str(e), "summary": {}}


# ============================================================================
# Server 6: map_layer_builder
# ============================================================================


def to_map_layer(
    csv_data: str,
    lat_col: str = "Latitude",
    lon_col: str = "Longitude",
    style_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convert tabular data to GeoJSON layer for map display.
    """
    try:
        # Validation gate using shared utility
        validation = validate_core_schema(csv_data)
        if validation["is_core_schema"] and not validation["ok"]:
            errors = "; ".join(validation["errors"][:3])
            return {
                "geojson": None,
                "error": f"CSV Structure Error: {errors}. This usually happens when the 'Source' field contains unescaped commas. Please run the 'normalize' tool to fix this automatically.",
            }

        df = pd.read_csv(io.StringIO(csv_data))

        if lat_col not in df.columns or lon_col not in df.columns:
            return {"geojson": None, "error": f"Missing {lat_col} or {lon_col} columns"}

        # Remove rows without coordinates
        df = df.dropna(subset=[lat_col, lon_col])

        features = []
        for _, row in df.iterrows():
            properties = {k: v for k, v in row.items() if k not in [lat_col, lon_col]}
            # Convert numpy types/nulls to Python types
            cleaned_props = {}
            for k, v in properties.items():
                if pd.isna(v):
                    cleaned_props[k] = None
                elif hasattr(v, "item"):  # Handles numpy types
                    cleaned_props[k] = v.item()
                elif isinstance(v, (np.integer, int)):
                    cleaned_props[k] = int(v)
                elif isinstance(v, (np.floating, float)):
                    cleaned_props[k] = float(v)
                else:
                    cleaned_props[k] = str(v)

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row[lon_col]), float(row[lat_col])],
                },
                "properties": cleaned_props,
            }
            features.append(feature)

        geojson = {"type": "FeatureCollection", "features": features}

        return {"geojson": geojson, "point_count": len(features)}
    except Exception as e:
        return {"geojson": None, "error": str(e)}


# ============================================================================
# Server 7: data_export
# ============================================================================


def export_csv(
    data_source: str = "raw_csv",
    filename: str = None,
    context_data: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Export data as a downloadable CSV file.

    Args:
        data_source: Which data to export (raw_csv, binary_matrix, clustered)
        filename: Suggested filename for download
        context_data: Data passed from context

    Returns:
        {csv, filename, row_count, downloadable}
    """
    try:
        csv_data = None

        if context_data:
            if data_source == "raw_csv":
                csv_data = context_data.get("raw_csv")
            elif data_source == "binary_matrix":
                csv_data = context_data.get("binary_matrix_csv")
            elif data_source == "clustered":
                csv_data = context_data.get("clustered_csv")
            else:
                # Try to get most recent data
                csv_data = (
                    context_data.get("clustered_csv")
                    or context_data.get("binary_matrix_csv")
                    or context_data.get("raw_csv")
                )

        if not csv_data:
            return {
                "error": f"No {data_source} data available to export",
                "csv": "",
                "downloadable": False,
            }

        # Count rows
        row_count = csv_data.count("\n")

        # Generate filename if not provided
        if not filename:
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"linguistic_data_{data_source}_{timestamp}.csv"

        return {
            "csv": csv_data,
            "filename": filename,
            "row_count": row_count,
            "downloadable": True,
        }
    except Exception as e:
        return {"error": str(e), "csv": "", "downloadable": False}


# ============================================================================
# Tool Handler Registry
# ============================================================================

TOOL_HANDLERS = {
    "wordlist_discovery": {
        "propose_wordlist": propose_wordlist,
        "refine_wordlist": refine_wordlist,
    },
    "linguistic_web_harvester": {
        "collect_multilingual_rows": collect_multilingual_rows,
    },
    "csv_ingest_and_validate": {
        "read_csv": read_csv,
        "validate_schema": validate_schema,
        "normalize": normalize,
    },
    "availability_matrix": {
        "to_binary_matrix": to_binary_matrix,
    },
    "clustering_hdbscan": {
        "cluster": cluster,
    },
    "map_layer_builder": {
        "to_map_layer": to_map_layer,
    },
    "data_export": {
        "export_csv": export_csv,
    },
}


async def execute_tool(
    server_name: str, tool_name: str, params: Dict[str, Any], llm_call_fn=None
) -> Dict[str, Any]:
    """
    Execute a tool from a specific server.
    """
    print(server_name)
    if server_name not in TOOL_HANDLERS:
        return {"error": f"Unknown server: {server_name}"}

    if tool_name not in TOOL_HANDLERS[server_name]:
        return {"error": f"Unknown tool: {tool_name} in server {server_name}"}

    handler = TOOL_HANDLERS[server_name][tool_name]

    # Check if handler is async
    import asyncio

    if asyncio.iscoroutinefunction(handler):
        # Inject llm_call_fn for tools that need it
        if tool_name in [
            "propose_wordlist",
            "refine_wordlist",
            "collect_multilingual_rows",
        ]:
            return await handler(**params, llm_call_fn=llm_call_fn)
        return await handler(**params)
    else:
        return handler(**params)
