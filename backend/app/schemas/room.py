from pydantic import BaseModel, Field


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RoomJoin(BaseModel):
    room_code: str = Field(min_length=6, max_length=20)


class RoomResponse(BaseModel):
    id: int
    room_code: str
    name: str
    host_id: int
    video_id: str | None = None

    class Config:
        from_attributes = True


class ParticipantResponse(BaseModel):
    user_id: int
    username: str
    role: str


class RoleUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=20)