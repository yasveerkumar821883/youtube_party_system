import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.models import Room, RoomParticipant, Role, User
from app.schemas.room import (
    RoomCreate,
    RoomJoin,
    RoomResponse,
    ParticipantResponse,
    RoleUpdate,
)


router = APIRouter(
    prefix="/api/rooms",
    tags=["Rooms"],
)


def generate_room_code(length: int = 6) -> str:
    characters = string.ascii_uppercase + string.digits

    return "".join(
        secrets.choice(characters)
        for _ in range(length)
    )


# =========================================================
# CREATE ROOM
# =========================================================

@router.post(
    "/create",
    response_model=RoomResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_room(
    room_data: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room_code = generate_room_code()

    while (
        db.query(Room)
        .filter(Room.room_code == room_code)
        .first()
    ):
        room_code = generate_room_code()

    new_room = Room(
        room_code=room_code,
        name=room_data.name,
        host_id=current_user.id,
    )

    db.add(new_room)
    db.commit()
    db.refresh(new_room)

    host_participant = RoomParticipant(
        room_id=new_room.id,
        user_id=current_user.id,
        role=Role.HOST,
    )

    db.add(host_participant)
    db.commit()

    return new_room


# =========================================================
# JOIN ROOM
# =========================================================

@router.post(
    "/join",
    response_model=RoomResponse,
)
def join_room(
    room_data: RoomJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room_code = room_data.room_code.strip().upper()

    room = (
        db.query(Room)
        .filter(Room.room_code == room_code)
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )

    existing_participant = (
        db.query(RoomParticipant)
        .filter(
            RoomParticipant.room_id == room.id,
            RoomParticipant.user_id == current_user.id,
        )
        .first()
    )

    # Already a member
    if existing_participant:
        return room

    # New member joins as PARTICIPANT
    participant = RoomParticipant(
        room_id=room.id,
        user_id=current_user.id,
        role=Role.PARTICIPANT,
    )

    db.add(participant)
    db.commit()

    return room


# =========================================================
# GET ROOM
# =========================================================

@router.get(
    "/{room_code}",
    response_model=RoomResponse,
)
def get_room(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = (
        db.query(Room)
        .filter(Room.room_code == room_code.upper())
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )

    # Make sure the user belongs to this room
    participant = (
        db.query(RoomParticipant)
        .filter(
            RoomParticipant.room_id == room.id,
            RoomParticipant.user_id == current_user.id,
        )
        .first()
    )

    if not participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant of this room",
        )

    return room


# =========================================================
# GET PARTICIPANTS
# =========================================================

@router.get(
    "/{room_code}/participants",
    response_model=list[ParticipantResponse],
)
def get_participants(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = (
        db.query(Room)
        .filter(Room.room_code == room_code.upper())
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )

    current_participant = (
        db.query(RoomParticipant)
        .filter(
            RoomParticipant.room_id == room.id,
            RoomParticipant.user_id == current_user.id,
        )
        .first()
    )

    if not current_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant of this room",
        )

    participants = (
        db.query(RoomParticipant, User)
        .join(
            User,
            RoomParticipant.user_id == User.id,
        )
        .filter(
            RoomParticipant.room_id == room.id
        )
        .all()
    )

    return [
        ParticipantResponse(
            user_id=participant.user_id,
            username=user.username,
            role=participant.role.value,
        )
        for participant, user in participants
    ]


# =========================================================
# ASSIGN ROLE
# =========================================================

@router.patch(
    "/{room_code}/participants/{user_id}/role",
    response_model=ParticipantResponse,
)
@router.patch(
    "/{room_code}/participants/{user_id}/role",
    response_model=ParticipantResponse,
)
def assign_role(
    room_code: str,
    user_id: int,
    role_data: RoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Find room
    room = (
        db.query(Room)
        .filter(Room.room_code == room_code.upper())
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )

    # Check current user's membership
    current_participant = (
        db.query(RoomParticipant)
        .filter(
            RoomParticipant.room_id == room.id,
            RoomParticipant.user_id == current_user.id,
        )
        .first()
    )

    if not current_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant of this room",
        )

    # Only HOST can assign roles
    if current_participant.role != Role.HOST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can assign roles",
        )

    # Validate requested role
    try:
        new_role = Role(role_data.role.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid role. Use "
                "MODERATOR, PARTICIPANT, or VIEWER"
            ),
        )

    # HOST cannot be assigned through this endpoint
    if new_role == Role.HOST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HOST role cannot be assigned",
        )

    # Prevent changing HOST role
    if user_id == room.host_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The host role cannot be changed",
        )

    # Find target participant
    target_participant = (
        db.query(RoomParticipant)
        .filter(
            RoomParticipant.room_id == room.id,
            RoomParticipant.user_id == user_id,
        )
        .first()
    )

    if not target_participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found in this room",
        )

    # Update role
    target_participant.role = new_role

    db.commit()
    db.refresh(target_participant)

    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    return ParticipantResponse(
        user_id=target_participant.user_id,
        username=target_user.username,
        role=target_participant.role.value,
    )
    # Validate requested role
    try:
        new_role = Role(role_data.role.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid role. Use "
                "MODERATOR, PARTICIPANT, or VIEWER"
            ),
        )

    # Prevent changing HOST role
    if user_id == room.host_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The host role cannot be changed",
        )

    # Find target participant
    target_participant = (
        db.query(RoomParticipant)
        .filter(
            RoomParticipant.room_id == room.id,
            RoomParticipant.user_id == user_id,
        )
        .first()
    )

    if not target_participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found in this room",
        )

    # Update role
    target_participant.role = new_role

    db.commit()
    db.refresh(target_participant)

    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    return ParticipantResponse(
        user_id=target_participant.user_id,
        username=target_user.username,
        role=target_participant.role.value,
    )

