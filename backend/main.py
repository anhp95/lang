from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.api import tiles, chat, data, raster

app = FastAPI(title="Research Platform Backend")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tiles.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(data.router, prefix="/api/v1")
app.include_router(
    raster.raster_router.router, prefix="/api/v1/raster", tags=["Raster"]
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
