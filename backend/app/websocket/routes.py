from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth.security import decode_access_token
from app.database.connection import SessionLocal
from app.models import Room, RoomParticipant, Role, User
from app.websocket.manager import manager

router = APIRouter(tags=["WebSocket"])


# --------------------------------------------------
# Playback permissions
# --------------------------------------------------

PLAYBACK_ROLES = {
    Role.HOST,
    Role.MODERATOR,
}


CONTROL_EVENTS = {
    "play",
    "pause",
    "seek",
    "change_video",
}


# --------------------------------------------------
# WebSocket
# --------------------------------------------------

@router.websocket("/ws/{room_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
):
    room_code = room_code.upper()

    # --------------------------------------------------
    # Authenticate WebSocket
    # --------------------------------------------------

    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=1008)
        return

    payload = decode_access_token(token)

    if not payload:
        await websocket.close(code=1008)
        return

    user_id = payload.get("sub")

    if not user_id:
        await websocket.close(code=1008)
        return

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        await websocket.close(code=1008)
        return

    # --------------------------------------------------
    # Check room + participant
    # --------------------------------------------------

    db = SessionLocal()

    try:
        room = (
            db.query(Room)
            .filter(Room.room_code == room_code)
            .first()
        )

        if not room:
            await websocket.close(code=1008)
            return

        participant = (
            db.query(RoomParticipant)
            .filter(
                RoomParticipant.room_id == room.id,
                RoomParticipant.user_id == user_id,
            )
            .first()
        )

        if not participant:
            await websocket.close(code=1008)
            return

        user_role = participant.role

    finally:
        db.close()

    # --------------------------------------------------
    # Connect
    # --------------------------------------------------

    await manager.connect(
        room_code,
        websocket,
    )

    try:

        # --------------------------------------------------
        # Notify everyone that user joined
        # --------------------------------------------------

        await manager.broadcast(
            room_code,
            {
                "event": "user_joined",
                "room_code": room_code,
                "user_id": user_id,
                "role": user_role.value,
            },
        )

        # --------------------------------------------------
        # Listen for messages
        # --------------------------------------------------

        while True:

            message = await websocket.receive_json()

            event = message.get("event")

            # --------------------------------------------------
            # Playback permission
            # --------------------------------------------------

            if event in CONTROL_EVENTS:

                if user_role not in PLAYBACK_ROLES:

                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": (
                                "You do not have permission "
                                "to control playback"
                            ),
                        }
                    )

                    continue

            # --------------------------------------------------
            # Change video
            # --------------------------------------------------

            if event == "change_video":

                video_id = message.get("video_id")

                if not video_id:

                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": "Video ID is required",
                        }
                    )

                    continue

                db = SessionLocal()

                try:

                    room = (
                        db.query(Room)
                        .filter(
                            Room.room_code == room_code
                        )
                        .first()
                    )

                    if not room:

                        await websocket.send_json(
                            {
                                "event": "error",
                                "message": "Room not found",
                            }
                        )

                        continue

                    room.video_id = str(video_id)

                    db.commit()

                finally:
                    db.close()

            # --------------------------------------------------
            # CHAT MESSAGE
            # --------------------------------------------------

            if event == "chat_message":

                chat_text = message.get("message")

                # Make sure message is a string
                if not isinstance(chat_text, str):

                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": "Chat message must be text",
                        }
                    )

                    continue

                # Remove unnecessary spaces
                chat_text = chat_text.strip()

                # Prevent empty messages
                if not chat_text:

                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": "Chat message cannot be empty",
                        }
                    )

                    continue

                # Limit message length
                if len(chat_text) > 500:

                    await websocket.send_json(
                        {
                            "event": "error",
                            "message": (
                                "Chat message cannot exceed "
                                "500 characters"
                            ),
                        }
                    )

                    continue

                # Get username from database
                db = SessionLocal()

                try:

                    user = (
                        db.query(User)
                        .filter(User.id == user_id)
                        .first()
                    )

                    if not user:

                        await websocket.send_json(
                            {
                                "event": "error",
                                "message": "User not found",
                            }
                        )

                        continue

                    username = user.username

                finally:
                    db.close()

                # Broadcast clean chat message
                await manager.broadcast(
                    room_code,
                    {
                        "event": "chat_message",
                        "room_code": room_code,
                        "user_id": user_id,
                        "username": username,
                        "role": user_role.value,
                        "message": chat_text,
                    },
                )

                # IMPORTANT:
                # Do not broadcast the original message again.
                continue

            # --------------------------------------------------
            # Broadcast normal WebSocket events
            # --------------------------------------------------

            await manager.broadcast(
                room_code,
                {
                    **message,
                    "user_id": user_id,
                    "role": user_role.value,
                },
            )

    except WebSocketDisconnect:

        manager.disconnect(
            room_code,
            websocket,
        )

        await manager.broadcast(
            room_code,
            {
                "event": "user_left",
                "room_code": room_code,
                "user_id": user_id,
            },
        )

