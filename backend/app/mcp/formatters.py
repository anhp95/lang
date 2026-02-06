"""
MCP Response Formatters

Centralized formatting logic for tool results.
Moved from chat.py to reduce endpoint complexity.
"""

from typing import Dict, Any, Optional


def format_tool_result(tool_name: str, result: Dict[str, Any]) -> str:
    """
    Format a tool result into a human-readable markdown summary.

    Returns:
        Markdown string to append to LLM response
    """
    if not result:
        return ""

    # Error case
    if "error" in result and result["error"]:
        return f"\n\n❌ **Error:** {result['error']}"

    # Wordlist result
    if "wordlist" in result and result["wordlist"]:
        wordlist = result["wordlist"]
        if len(wordlist) <= 10:
            items = ", ".join(wordlist)
        else:
            items = ", ".join(wordlist[:10]) + f"... ({len(wordlist)} total)"
        return f"\n\n✅ **Wordlist created ({len(wordlist)} concepts):**\n{items}"

    # Downloadable export
    if "downloadable" in result and result.get("downloadable"):
        filename = result.get("filename", "data.csv")
        row_count = result.get("row_count", 0)
        return (
            f"\n\n✅ **CSV ready for download:**\n"
            f"• Filename: `{filename}`\n"
            f"• Rows: {row_count}\n\n"
            f"📥 Click the **Download** button below to save the file."
        )

    # CSV data result
    if "csv" in result and result["csv"]:
        csv_data = result["csv"]
        lines = csv_data.count("\n")
        preview_lines = csv_data.split("\n")[:4]
        preview = "\n".join(preview_lines)
        if lines > 3:
            preview += f"\n... ({lines} rows total)"

        # Check if this is from a specific tool
        if tool_name == "to_binary_matrix":
            summary = result.get("summary", {})
            lang_count = summary.get("languages", "?")
            concept_count = summary.get("concepts", "?")
            coverage = summary.get("avg_coverage", "?")
            return (
                f"\n\n✅ **Binary matrix created:**\n"
                f"• Languages: {lang_count}\n"
                f"• Concepts: {concept_count}\n"
                f"• Average coverage: {coverage}%\n\n"
                f"📥 **Download available** - Click the download button to save."
            )

        if tool_name == "cluster":
            summary = result.get("summary", {})
            clusters = summary.get("total_clusters", "?")
            clustered = summary.get("clustered_languages", "?")
            noise = summary.get("noise_points", 0)
            return (
                f"\n\n✅ **Clustering complete:**\n"
                f"• Clusters found: {clusters}\n"
                f"• Languages clustered: {clustered}\n"
                f"• Noise points: {noise}\n\n"
                f"📥 **Download available** - Click the download button to save."
            )

        if tool_name == "normalize":
            return (
                f"\n\n✅ **CSV normalized ({lines} rows):**\n"
                f"Data has been cleaned and is ready for analysis.\n\n"
                f"📥 **Download available**"
            )

        # Generic CSV result
        return (
            f"\n\n✅ **Data collected ({lines} rows):**\n"
            f"```csv\n{preview}\n```\n\n"
            f"📥 **Download available** - Click the download button to save as CSV.\n\n"
            f"What would you like to do next?\n"
            f"• **Normalize** - Clean and validate the data\n"
            f"• **Convert to matrix** - Create a binary availability matrix\n"
            f"• **Cluster** - Group languages by similarity\n"
            f"• **Map** - Visualize on a map"
        )

    # Summary result
    if "summary" in result and result["summary"]:
        summary = result["summary"]
        if isinstance(summary, dict):
            summary_lines = [f"• {k}: {v}" for k, v in summary.items()]
            return f"\n\n✅ **Results:**\n" + "\n".join(summary_lines)

    # GeoJSON result
    if "geojson" in result and result.get("geojson"):
        point_count = result.get(
            "point_count", len(result["geojson"].get("features", []))
        )
        return f"\n\n✅ **Map layer created** with {point_count} points. Check the map view!"

    # Notes fallback
    if "notes" in result:
        return f"\n\n✅ {result['notes']}"

    # Validation result
    if "ok" in result:
        if result["ok"]:
            return "\n\n✅ **Validation passed** - Data is ready for processing."
        else:
            errors = result.get("errors", [])
            error_text = "\n".join(f"• {e}" for e in errors[:5])
            return f"\n\n❌ **Validation failed:**\n{error_text}"

    return ""


def get_default_response(tool_name: str) -> str:
    """
    Get a default response when LLM text is empty after cleanup.
    """
    tool_descriptions = {
        "propose_wordlist": "generating your wordlist",
        "refine_wordlist": "refining the wordlist",
        "collect_multilingual_rows": "collecting multilingual data",
        "read_csv": "parsing the CSV file",
        "validate_schema": "validating the data schema",
        "normalize": "normalizing the CSV data",
        "to_binary_matrix": "creating the binary matrix",
        "cluster": "clustering the languages",
        "to_map_layer": "creating the map layer",
        "export_csv": "preparing your download",
    }

    description = tool_descriptions.get(tool_name, f"running {tool_name}")
    return f"I'm {description}..."
