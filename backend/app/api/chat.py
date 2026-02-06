"""
Chat API - MCP Architecture with Conversational-First Approach

This module implements a chat endpoint that:
1. Behaves conversationally by default
2. Uses MCP tools only when explicitly requested
3. Does not force workflows on users
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import os
import json
import time

from app.tools.orchestrator import orchestrator
from app.mcp.handlers import execute_tool
from app.mcp.formatters import format_tool_result, get_default_response
from app.mcp.utils import clean_llm_response


router = APIRouter()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    provider: str = "ollama"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    context: Optional[str] = None
    session_id: str = "default"
    uploaded_file: Optional[str] = None  # For CSV uploads


class ChatResponse(BaseModel):
    role: str
    content: str
    tool_data: Optional[Dict[str, Any]] = None
    thinking_time: Optional[float] = None


async def call_llm_with_messages(
    messages: List[Dict[str, str]],
    provider: str,
    model: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> str:
    """
    Call LLM with a list of messages.
    """
    async with httpx.AsyncClient(timeout=120.0) as client:
        if provider == "ollama":
            url = base_url or OLLAMA_BASE_URL
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            response = await client.post(
                f"{url}/api/chat",
                headers=headers,
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                },
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("message", {}).get("content", "")
            else:
                raise Exception(f"LLM error: {response.text}")

        elif provider == "openai":
            if not api_key:
                raise Exception("OpenAI API key required")

            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                },
            )

            if response.status_code == 200:
                result = response.json()
                return result["choices"][0]["message"]["content"]
            else:
                raise Exception(
                    f"OpenAI error ({response.status_code}): {response.text}"
                )

        elif provider == "anthropic":
            if not api_key:
                raise Exception("Anthropic API key required")

            # Basic Anthropic implementation
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [m for m in messages if m["role"] != "system"],
                    "system": next(
                        (m["content"] for m in messages if m["role"] == "system"), ""
                    ),
                    "max_tokens": 1024,
                },
            )

            if response.status_code == 200:
                result = response.json()
                return result["content"][0]["text"]
            else:
                raise Exception(
                    f"Anthropic error ({response.status_code}): {response.text}"
                )

        elif provider == "gemini":
            if not api_key:
                raise Exception("Gemini API key required")

            # Basic Gemini implementation
            # Note: Gemini messages format is different, this is a simplified version
            contents = []
            for m in messages:
                role = "user" if m["role"] in ["user", "system"] else "model"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})

            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                headers={"Content-Type": "application/json"},
                json={"contents": contents},
            )

            if response.status_code == 200:
                result = response.json()
                return result["candidates"][0]["content"]["parts"][0]["text"]
            else:
                raise Exception(
                    f"Gemini error ({response.status_code}): {response.text}"
                )

        else:
            raise Exception(f"Unsupported provider: {provider}")


async def call_llm_simple(
    prompt: str,
    provider: str,
    model: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> str:
    """Simple LLM call with single prompt."""
    return await call_llm_with_messages(
        [{"role": "user", "content": prompt}], provider, model, api_key, base_url
    )


@router.post("/chat", response_model=ChatResponse)
async def chat_with_llm(request: ChatRequest):
    """
    Conversational-first chat endpoint with optional MCP tool use.

    The assistant behaves conversationally by default and only uses
    tools when the user explicitly requests them.
    """
    start_time = time.time()
    # Get conversation context
    context = orchestrator.get_context(request.session_id)
    print("context", context)

    # Handle file upload - store in context BEFORE processing message
    if request.uploaded_file:
        context.raw_csv = request.uploaded_file
        context.raw_csv_source = "upload"
        context.raw_csv_rows = request.uploaded_file.count("\n")

    # Get last user message
    user_message = request.messages[-1].content if request.messages else ""

    # Create LLM call function for orchestrator
    async def llm_call_fn(conversation: List[Dict[str, str]]) -> str:
        return await call_llm_with_messages(
            conversation,
            request.provider,
            request.model,
            request.api_key,
            request.base_url,
        )

    # Process message through MCP orchestrator
    result = await orchestrator.process_message(
        message=user_message,
        context=context,
        llm_call_fn=llm_call_fn,
        uploaded_file=request.uploaded_file,
    )

    # Handle tool call if present
    if result["type"] == "tool_call" and result["tool_call"]:
        tool_call = result["tool_call"]

        # Pre-validate tool parameters
        validation_error = orchestrator.validate_tool_params(tool_call, context)
        if validation_error:
            return ChatResponse(
                role="assistant",
                content=f"{result['content']}\n\n⚠️ **Cannot execute tool:** {validation_error}",
                tool_data=None,
                thinking_time=round(time.time() - start_time, 2),
            )

        # Create LLM call function for tool handlers
        async def tool_llm_fn(prompt: str) -> str:
            return await call_llm_simple(
                prompt,
                request.provider,
                request.model,
                request.api_key,
                request.base_url,
            )

        # Execute the tool
        try:
            # Special handling for export_csv - pass context data
            tool_params = tool_call["params"].copy()
            if tool_call["tool"] == "export_csv":
                tool_params["context_data"] = {
                    "raw_csv": context.raw_csv,
                    "binary_matrix_csv": context.binary_matrix_csv,
                    "clustered_csv": context.clustered_csv,
                }

            tool_result = await execute_tool(
                server_name=tool_call["server"],
                tool_name=tool_call["tool"],
                params=tool_params,
                llm_call_fn=tool_llm_fn,
            )
            print("tool_result", tool_result)

            # Update context with tool result
            orchestrator.update_context(context, tool_call, tool_result)

            # Clean up the LLM response using shared utility
            response_content = clean_llm_response(result["content"])

            # If response is empty after cleanup, provide a default message
            if not response_content:
                response_content = get_default_response(tool_call["tool"])

            # Build result summary using centralized formatter
            result_summary = format_tool_result(tool_call["tool"], tool_result)
            response_content += result_summary

            return ChatResponse(
                role="assistant",
                content=response_content,
                tool_data={
                    "tool": tool_call["tool"],
                    "server": tool_call["server"],
                    "result": tool_result,
                },
                thinking_time=round(time.time() - start_time, 2),
            )

        except Exception as e:
            error_msg = str(e) or e.__class__.__name__ or "Unknown error"
            return ChatResponse(
                role="assistant",
                content=f"{result['content']}\n\n❌ **Tool execution failed:** {error_msg}",
                tool_data=None,
                thinking_time=round(time.time() - start_time, 2),
            )

    # Regular conversational response
    return ChatResponse(
        role="assistant",
        content=result["content"],
        tool_data=None,
        thinking_time=round(time.time() - start_time, 2),
    )


@router.get("/models")
async def list_models(
    provider: str = "ollama",
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
):
    """
    List available models from the LLM provider.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "ollama":
                url = base_url or OLLAMA_BASE_URL
                headers = {}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"

                response = await client.get(f"{url}/api/tags", headers=headers)

                if response.status_code == 200:
                    # Handle UTF-8 encoding properly
                    models_data = response.json().get("models", [])
                    models = []
                    for m in models_data:
                        try:
                            model_name = m.get("name", "")
                            if model_name:
                                models.append(str(model_name))
                        except (UnicodeEncodeError, UnicodeDecodeError):
                            continue
                    return {"models": models}
                else:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to fetch models: {response.text}",
                    )

            elif provider == "openai":
                if not api_key:
                    raise HTTPException(
                        status_code=400, detail="API key required for OpenAI"
                    )

                response = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )

                if response.status_code == 200:
                    data = response.json()
                    models = [m["id"] for m in data.get("data", [])]
                    # Filter to chat models
                    chat_models = [m for m in models if "gpt" in m.lower()]
                    return {"models": sorted(chat_models)}
                else:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to fetch OpenAI models: {response.text}",
                    )

            elif provider == "anthropic":
                if not api_key:
                    raise HTTPException(
                        status_code=400, detail="API key required for Anthropic"
                    )

                # Anthropic doesn't have a models API, so we return a static list of known models
                # Validate API key by making a simple request
                response = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    models = [m["id"] for m in data.get("data", [])]
                    return {"models": sorted(models)}
                else:
                    # If the models endpoint fails, return known models as fallback
                    return {
                        "models": [
                            "claude-sonnet-4-20250514",
                            "claude-3-5-sonnet-20241022",
                            "claude-3-5-haiku-20241022",
                            "claude-3-opus-20240229",
                            "claude-3-haiku-20240307",
                        ]
                    }

            elif provider == "gemini":
                if not api_key:
                    raise HTTPException(
                        status_code=400, detail="API key required for Gemini"
                    )

                response = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
                )

                if response.status_code == 200:
                    data = response.json()
                    models = []
                    for m in data.get("models", []):
                        # Extract model name from full path (e.g., "models/gemini-pro" -> "gemini-pro")
                        name = m.get("name", "").replace("models/", "")
                        # Filter to generative models
                        if name and "gemini" in name.lower():
                            models.append(name)
                    return {"models": sorted(models)}
                else:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to fetch Gemini models: {response.text}",
                    )

            else:
                return {"models": []}

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to {provider}. Please check if the service is running.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
