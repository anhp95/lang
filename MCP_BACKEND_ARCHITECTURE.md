# MCP Backend Architecture: Conversational-First Linguistic Pipeline

This document outlines the architecture and associated functions of the LLM-driven backend, designed for flexible, conversational linguistic research.

## 1. Core Architecture Overview

The system follows a **Model Context Protocol (MCP)** inspired architecture, pivoting away from rigid, hardcoded workflows. Instead, it uses a thin orchestration layer that prioritizes natural conversation and invokes specialized tools only when explicitly requested.

### High-Level Flow
1. **User Message**: Client sends a message to the `/chat` endpoint.
2. **Intent Analysis**: The **Orchestrator** builds a system prompt containing available tools and context. The LLM decides if it can answer conversationally or needs a tool.
3. **Tool Dispatch**: If a tool is requested (`{"server": "...", "tool": "..."}`), the **Chat Handler** executes the corresponding function in `app/mcp/handlers.py`.
4. **Context Update**: Tool results (CSVs, wordlists, etc.) are saved to the `ConversationContext`.
5. **Polished Response**: The system cleans the LLM response (removing JSON blocks) and appends a human-readable summary of the tool performance.

---

## 2. Key Components

### A. FastAPI Chat Endpoint (`app/api/chat.py`)
Responsible for HTTP communication, provider routing, and the final response formatting.
- **`call_llm_with_messages`**: Centralized gateway for all LLM calls. Supports:
    - **Ollama**: Local execution for privacy and speed.
    - **OpenAI**: GPT-4o and O1 models.
    - **Anthropic**: Claude 3.5 Sonnet / Opus.
    - **Google Gemini**: Pro and Flash models.
- **`chat_with_llm`**: The main POST handler that coordinates between the user, the orchestrator, and the tool execution logic.

### B. Conversational Orchestrator (`app/tools/orchestrator.py`)
The "brain" that manages the session and tool triggers.
- **`ConversationContext`**: Stores in-memory data for the session, including `raw_csv`, `binary_matrix_csv`, `clustered_csv`, and `wordlist`.
- **`process_message`**: Orchestrates the LLM call and extracts JSON tool calls.
- **`_enrich_params`**: Automatically injects context data (like the current CSV) into tool calls so the LLM doesn't have to repeat large datasets.

---

## 3. MCP Servers & Tool Handlers

Tools are organized into single-responsibility "Servers" defined in `app/mcp/servers.py` and implemented in `app/mcp/handlers.py`.

### 1. `wordlist_discovery`
- **`propose_wordlist`**: Generates culturally universal concept lists for a topic (e.g., "boats", "kinship").
- **`refine_wordlist`**: Modifies an existing list based on feedback.

### 2. `linguistic_web_harvester`
- **`collect_multilingual_rows`**: Generates high-quality prompts to gather (Glottocode, Language Name, Concept, Form) data. Returns results as structured CSV.

### 3. `csv_ingest_and_validate`
- **`read_csv`**: Parses uploaded content and returns basic stats (column names, row counts).
- **`validate_schema`**: Checks if the data matches the required Glottocode/Concept format.
- **`normalize`**: Fixes encoding, whitespace, and formatting issues.

### 4. `availability_matrix`
- **`to_binary_matrix`**: Transposes "Concept-per-row" data into a wide binary matrix (Languages x Concepts) where 1 indicates data presence.

### 5. `clustering_hdbscan`
- **`cluster`**: Uses the HDBSCAN algorithm (with Jaccard metric) to group languages based on shared concept availability.

### 6. `map_layer_builder`
- **`to_map_layer`**: Converts tabular data with coordinates into a GeoJSON `FeatureCollection` ready for Deck.gl/KeplerGL visualization.

### 7. `data_export`
- **`export_csv`**: Packages the current session data into a downloadable CSV file with a timestamped filename.

---

## 4. Design Principles

- **On-Demand Utility**: Tools are independent. You can map without clustering, or cluster without a wordlist.
- **Transparency**: Every tool call is summarized in the chat.
- **User Autonomy**: The assistant asks for permission before proceeding to heavy analysis steps (like matrix creation or clustering).
- **Data Persistence**: The `/chat` session maintains state, allowing "What does it look like on a map?" to automatically refer to the result of the previous clustering step.
