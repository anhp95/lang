from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import httpx
import os

router = APIRouter()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "llama2"
    context: Optional[str] = None

class ChatResponse(BaseModel):
    role: str
    content: str

@router.post("/chat", response_model=ChatResponse)
async def chat_with_llm(request: ChatRequest):
    """
    Forward chat messages to Ollama LLM and return response.
    """
    try:
        # Build the prompt with context if provided
        messages = []
        
        if request.context:
            messages.append({
                "role": "system",
                "content": f"You are a research assistant for a platform containing language, archaeology, and genetics data. Here is some context about the current data view: {request.context}"
            })
        
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": request.model,
                    "messages": messages,
                    "stream": False
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Ollama API error")
            
            result = response.json()
            return ChatResponse(
                role="assistant",
                content=result.get("message", {}).get("content", "No response from LLM")
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="LLM request timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
