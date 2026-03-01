"""
Ad Auction Simulator — FastAPI Application

Run with:
    uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router

app = FastAPI(
    title="Ad Auction Simulator",
    description=(
        "GSP/VCG auction engine with recommender model routing "
        "and LLM-powered what-if analysis. Built for exploring auction theory and monetization strategy."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {
        "name": "Ad Auction Simulator",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "segments": "/api/segments",
            "advertisers": "/api/advertisers",
            "auction_run": "/api/auction/run",
            "auction_compare": "/api/auction/compare",
            "reserve_sweep": "/api/sweep/reserve",
            "quality_sweep": "/api/sweep/quality",
            "landscape": "/api/landscape",
            "recommender_route": "/api/recommender/route",
            "recommender_all": "/api/recommender/all",
            "whatif": "/api/whatif",
        },
    }
