import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.auth.routes import router as auth_router
from app.api.room import router as rooms_router
from app.database.connection import Base, engine
from app.models import User, Room, RoomParticipant
from app.websocket.routes import router as websocket_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="YouTube Watch Party API",
    version="1.0.0"
)


frontend_url = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(rooms_router)
app.include_router(websocket_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
@app.get("/api/health/db")
def database_health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "ok",
            "database": "connected",
        }

    except Exception as e:
        return {
            "status": "error",
            "database": "disconnected",
            "error": str(e),
        }