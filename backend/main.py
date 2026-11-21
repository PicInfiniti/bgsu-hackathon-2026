from fastapi import FastAPI

from backend.routes.trips import router as trips_router

app = FastAPI(
    title="picInfiniti Away-Game Travel Planner",
    description="Local starter API. Pricing and Aivana integration are pending.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.include_router(trips_router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
