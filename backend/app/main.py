from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://youtube-party-system.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(rooms_router)
app.include_router(websocket_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}