"""
MCP Orchestrator - Conversational First, Tools On-Demand

This orchestrator follows the principle:
- Be conversational by default
- Use tools only when explicitly requested or clearly implied
- Never force a workflow on the user
- Tools are optional and callable independently
"""

from typing import Dict, List, Optional, Any
import json
import re


class ConversationContext:
    """
    Session context for conversation state and active data.
    Tracks the current active dataset for tool invocation.
    """

    def __init__(self):
        self.wordlist: Optional[List[str]] = None
        self.raw_csv: Optional[str] = None
        self.normalized_csv: Optional[str] = None  # NEW: Track normalized data
        self.binary_matrix_csv: Optional[str] = None
        self.clustered_csv: Optional[str] = None
        self.last_output: Optional[Dict] = None
        self.conversation_history: List[Dict[str, str]] = []

        # Metadata for better context awareness
        self.raw_csv_source: Optional[str] = None  # "upload" | "harvest" | "unknown"
        self.raw_csv_rows: int = 0
        self.normalized_csv_rows: int = 0
        self.matrix_languages: int = 0
        self.matrix_concepts: int = 0

    def get_active_csv(self) -> Optional[str]:
        """
        Get the best available CSV data for processing.
        Priority: clustered > matrix > normalized > raw
        """
        return (
            self.clustered_csv
            or self.binary_matrix_csv
            or self.normalized_csv
            or self.raw_csv
        )

    def get_active_csv_name(self) -> str:
        """Get human-readable name of active data."""
        if self.clustered_csv:
            return "clustered data"
        if self.binary_matrix_csv:
            return f"binary matrix ({self.matrix_languages} languages, {self.matrix_concepts} concepts)"
        if self.normalized_csv:
            return f"normalized CSV ({self.normalized_csv_rows} rows)"
        if self.raw_csv:
            source = self.raw_csv_source or "uploaded"
            return f"{source} CSV ({self.raw_csv_rows} rows)"
        return "no data"

    def has_any_data(self) -> bool:
        """Check if any CSV data is available."""
        return bool(
            self.raw_csv
            or self.normalized_csv
            or self.binary_matrix_csv
            or self.clustered_csv
        )

    def to_dict(self) -> Dict:
        """Serialize context for system prompt."""
        return {
            "has_wordlist": self.wordlist is not None,
            "wordlist_size": len(self.wordlist) if self.wordlist else 0,
            "has_raw_csv": self.raw_csv is not None,
            "has_normalized_csv": self.normalized_csv is not None,
            "has_binary_matrix": self.binary_matrix_csv is not None,
            "has_clustered_data": self.clustered_csv is not None,
            "active_data": self.get_active_csv_name() if self.has_any_data() else None,
            "raw_csv_rows": self.raw_csv_rows,
            "matrix_languages": self.matrix_languages,
        }


def build_system_prompt(context: ConversationContext) -> str:
    """
    Build system prompt for conversational-first LLM interaction.
    """
    # Build context summary
    context_info = context.to_dict()
    context_lines = []

    if context_info["has_wordlist"]:
        context_lines.append(
            f"- Wordlist available ({context_info['wordlist_size']} concepts)"
        )
    if context_info["has_raw_csv"]:
        context_lines.append(
            f"- Raw linguistic CSV loaded ({context_info['raw_csv_rows']} rows)"
        )
    if context_info["has_normalized_csv"]:
        context_lines.append("- Normalized CSV ready")
    if context_info["has_binary_matrix"]:
        context_lines.append(
            f"- Binary matrix created ({context_info['matrix_languages']} languages)"
        )
    if context_info["has_clustered_data"]:
        context_lines.append("- Clustered data available")

    # Active data indicator
    if context_info["active_data"]:
        context_lines.append(f"\n**ACTIVE DATA:** {context_info['active_data']}")

    context_str = "\n".join(context_lines) if context_lines else "No data loaded yet"

    return f"""You are a helpful research assistant for linguistic analysis. You can help with:
- Creating wordlists for cross-linguistic comparison
- Collecting multilingual data
- Building binary availability matrices
- Clustering languages with HDBSCAN
- Mapping results

**IMPORTANT BEHAVIORAL RULES:**
1. Be conversational by default - chat normally unless a tool is needed
2. Only use tools when the user EXPLICITLY requests or clearly implies it
3. Never force a workflow - tools are optional and independent
4. When unsure, ask a brief clarifying question instead of assuming

**Available Data:**
{context_str}

**Server and Tool Mapping (MUST use correct server for each tool):**

SERVER: wordlist_discovery
  - propose_wordlist: Generate a wordlist for a topic
  - refine_wordlist: Modify an existing wordlist

SERVER: linguistic_web_harvester
  - collect_multilingual_rows: Search for linguistic data across languages

SERVER: csv_ingest_and_validate
  - read_csv: Parse CSV data
  - validate_schema: Check CSV columns
  - normalize: Fix formatting

SERVER: availability_matrix
  - to_binary_matrix: Convert to binary availability matrix

SERVER: clustering_hdbscan
  - cluster: Cluster languages using HDBSCAN

SERVER: map_layer_builder
  - to_map_layer: Create map visualization

SERVER: data_export
  - export_csv: Export data as downloadable CSV file


**When NOT to use tools:**
- User is just chatting or asking questions
- User hasn't explicitly requested an action
- You're unsure what the user wants (ask instead)


**Tool Call Format:**
When you decide to use a tool, include this JSON in your response:

For wordlist creation (server: wordlist_discovery):
```json
{{"server": "wordlist_discovery", "tool": "propose_wordlist", "params": {{"topic": "kinship"}}}}
```
Example with constraints:
```json
{{"server": "wordlist_discovery", "tool": "propose_wordlist", "params": {{"topic": "boats", "constraints": {{"max_terms": 15, "region": "Oceania"}}}}}}
```


For data collection (server: linguistic_web_harvester):
```json
{{"server": "linguistic_web_harvester", "tool": "collect_multilingual_rows", "params": {{"wordlist": ["mother", "father"]}}}}
```

For matrix conversion (server: availability_matrix):
```json
{{"server": "availability_matrix", "tool": "to_binary_matrix", "params": {{}}}}
```

For clustering (server: clustering_hdbscan):
```json
{{"server": "clustering_hdbscan", "tool": "cluster", "params": {{}}}}
```

For mapping (server: map_layer_builder):
```json
{{"server": "map_layer_builder", "tool": "to_map_layer", "params": {{}}}}
```

For CSV export/download (server: data_export):
```json
{{"server": "data_export", "tool": "export_csv", "params": {{"data_source": "raw_csv"}}}}
```


**IMPORTANT BEHAVIOR AFTER DATA COLLECTION:**
After collecting data with collect_multilingual_rows, ALWAYS tell the user:
- The data is ready and can be downloaded using the 📥 button
- **Highly Recommend**: Advise the user to run the **normalize** tool (csv_ingest_and_validate) if they plan to build a matrix, cluster, or map. This ensures proper escaping of fields with commas (like 'Source').
- Ask if they want to proceed with further analysis (matrix, clustering, mapping)
- Do NOT automatically proceed to the next step


**If user uploads data without instructions:**
Ask briefly: "What would you like to do with this—validate, build matrix, cluster, or map?"

Be helpful, brief, and respect the user's autonomy to choose what they want to do."""


class MCPOrchestrator:
    """
    Conversational-first orchestrator with optional tool use.
    """

    def __init__(self):
        self.contexts: Dict[str, ConversationContext] = {}

    def get_context(self, session_id: str) -> ConversationContext:
        """Get or create conversation context."""
        if session_id not in self.contexts:
            self.contexts[session_id] = ConversationContext()
        return self.contexts[session_id]

    async def process_message(
        self,
        message: str,
        context: ConversationContext,
        llm_call_fn,
        uploaded_file: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Process a user message conversationally.

        Args:
            message: User's message
            context: Conversation context
            llm_call_fn: Async function to call LLM
            uploaded_file: Optional CSV file content

        Returns:
            {
                "type": "text" | "tool_call",
                "content": str,  # LLM response text
                "tool_call": Optional[{server, tool, params}],
                "tool_result": Optional[dict]
            }
        """
        # Handle file upload
        if uploaded_file:
            context.raw_csv = uploaded_file
            if not message.strip():
                message = "I've uploaded a CSV file."

        # Add to conversation history
        context.conversation_history.append({"role": "user", "content": message})

        # Build conversation for LLM
        system_prompt = build_system_prompt(context)

        # Prepare conversation (last 10 messages for context)
        conversation = [{"role": "system", "content": system_prompt}]
        conversation.extend(context.conversation_history[-10:])

        # Call LLM
        try:
            llm_response = await llm_call_fn(conversation)
        except Exception as e:
            return {
                "type": "error",
                "content": f"I encountered an error: {str(e)}",
                "tool_call": None,
                "tool_result": None,
            }

        # Add to history
        context.conversation_history.append(
            {"role": "assistant", "content": llm_response}
        )

        # Check for tool call in response
        tool_call = self._extract_tool_call(llm_response)

        if tool_call:
            # Enrich params from context
            tool_call = self._enrich_params(tool_call, context)

            return {
                "type": "tool_call",
                "content": llm_response,
                "tool_call": tool_call,
                "tool_result": None,  # Will be populated by caller
            }
        else:
            return {
                "type": "text",
                "content": llm_response,
                "tool_call": None,
                "tool_result": None,
            }

    def _extract_tool_call(self, response: str) -> Optional[Dict[str, Any]]:
        """
        Extract tool call from LLM response.
        Looks for JSON with server, tool, and params.
        """
        try:
            # Look for JSON in code block
            code_match = re.search(
                r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL
            )
            if code_match:
                data = json.loads(code_match.group(1))
                if "server" in data and "tool" in data:
                    return {
                        "server": data["server"],
                        "tool": data["tool"],
                        "params": data.get("params", {}),
                    }

            # Look for inline JSON with server and tool
            json_match = re.search(r'\{"server"[^}]+\}', response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(0))
                if "server" in data and "tool" in data:
                    return {
                        "server": data["server"],
                        "tool": data["tool"],
                        "params": data.get("params", {}),
                    }

        except json.JSONDecodeError:
            pass

        return None

    def _enrich_params(
        self, tool_call: Dict[str, Any], context: ConversationContext
    ) -> Dict[str, Any]:
        """
        Enrich tool parameters from context when not provided.
        Returns enriched tool call or raises ValueError if required data is missing.
        """
        server = tool_call["server"]
        tool = tool_call["tool"]
        params = tool_call["params"].copy()  # Don't mutate original

        # === WORDLIST TOOLS ===
        if tool == "collect_multilingual_rows" and "wordlist" not in params:
            if context.wordlist:
                params["wordlist"] = context.wordlist

        # === CSV TOOLS - Smart data binding ===

        # read_csv / validate_schema / normalize: Use raw CSV
        if tool in ["read_csv", "validate_schema", "normalize"]:
            if "csv_data" not in params:
                if context.raw_csv:
                    params["csv_data"] = context.raw_csv

        # to_binary_matrix: Prefer normalized, fallback to raw
        if tool == "to_binary_matrix" and "csv_data" not in params:
            csv_to_use = context.normalized_csv or context.raw_csv
            if csv_to_use:
                params["csv_data"] = csv_to_use

        # cluster: Requires matrix
        if tool == "cluster" and "csv_data" not in params:
            if context.binary_matrix_csv:
                params["csv_data"] = context.binary_matrix_csv

        # to_map_layer: Use best available (clustered > matrix > normalized > raw)
        if tool == "to_map_layer" and "csv_data" not in params:
            csv_to_use = context.get_active_csv()
            if csv_to_use:
                params["csv_data"] = csv_to_use

        # export_csv: Context data is handled separately in chat.py

        return {"server": server, "tool": tool, "params": params}

    def validate_tool_params(
        self, tool_call: Dict[str, Any], context: ConversationContext
    ) -> Optional[str]:
        """
        Validate that required parameters are present.
        Returns error message if validation fails, None if OK.
        """
        tool = tool_call["tool"]
        params = tool_call["params"]

        # Tools that require CSV data
        csv_required_tools = {
            "read_csv": "csv_data",
            "validate_schema": "csv_data",
            "normalize": "csv_data",
            "to_binary_matrix": "csv_data",
            "cluster": "csv_data",
            "to_map_layer": "csv_data",
        }

        if tool in csv_required_tools:
            param_name = csv_required_tools[tool]
            if param_name not in params or not params[param_name]:
                # Check if context has data
                if not context.has_any_data():
                    return f"No data available. Please upload a CSV file or collect data first."
                # Specific messages for different tools
                if tool == "cluster" and not context.binary_matrix_csv:
                    return "Clustering requires a binary matrix. Please run 'to_binary_matrix' first."
                if tool == "to_binary_matrix" and not (
                    context.raw_csv or context.normalized_csv
                ):
                    return "No raw data available. Please upload or collect data first."

        # Wordlist tools
        if tool == "collect_multilingual_rows":
            if "wordlist" not in params or not params["wordlist"]:
                if not context.wordlist:
                    return "No wordlist available. Please create a wordlist first with 'propose_wordlist'."

        return None

    def update_context(
        self,
        context: ConversationContext,
        tool_call: Dict[str, Any],
        result: Dict[str, Any],
    ):
        """
        Update context based on tool execution result.
        Tracks data and metadata for smart tool invocation.
        """
        tool = tool_call["tool"]

        if tool == "propose_wordlist" and "wordlist" in result:
            context.wordlist = result["wordlist"]

        if tool == "refine_wordlist" and "wordlist" in result:
            context.wordlist = result["wordlist"]

        if tool == "collect_multilingual_rows":
            csv_data = None
            if isinstance(result, str):
                csv_data = result
            elif "csv" in result:
                csv_data = result["csv"]

            if csv_data:
                context.raw_csv = csv_data
                context.raw_csv_source = "harvest"
                context.raw_csv_rows = csv_data.count("\n")

        # Normalize tool
        if tool == "normalize" and "csv" in result:
            context.normalized_csv = result["csv"]
            context.normalized_csv_rows = result.get(
                "row_count", result["csv"].count("\n")
            )

        # Binary matrix
        if tool == "to_binary_matrix" and "csv" in result:
            context.binary_matrix_csv = result["csv"]
            summary = result.get("summary", {})
            context.matrix_languages = summary.get("languages", 0)
            context.matrix_concepts = summary.get("concepts", 0)

        # Clustering
        if tool == "cluster" and "csv" in result:
            context.clustered_csv = result["csv"]

        context.last_output = result


# Global orchestrator instance
orchestrator = MCPOrchestrator()
