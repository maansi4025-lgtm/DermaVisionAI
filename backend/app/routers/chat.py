from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import ChatMessage, ChatSession, Scan, User
from ..schemas import ChatIn
from ..serializers import iso
from ..services import chatbot

router = APIRouter(prefix="/api/chat", tags=["chat"])
HISTORY_LIMIT = 20


@router.post("/message")
def send_message(body: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.session_id:
        session = db.scalar(select(ChatSession).where(ChatSession.id == body.session_id, ChatSession.user_id == user.id))
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat session not found")
    else:
        session = ChatSession(user_id=user.id)
        db.add(session)

    scan_id = body.scan_id or session.scan_id
    scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id)) if scan_id else None
    if scan and not session.scan_id:
        session.scan_id = scan.id

    db.flush()  # assigns session.id
    db.add(ChatMessage(session_id=session.id, role="user", content=body.message.strip()))
    db.flush()

    recent = db.scalars(
        select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.id.desc()).limit(HISTORY_LIMIT)
    ).all()[::-1]
    while recent and recent[0].role != "user":  # the API requires the first turn to be the user's
        recent.pop(0)

    result = chatbot.respond(recent, user.full_name.split()[0], scan, body.lang[:2].lower())

    db.add(ChatMessage(session_id=session.id, role="assistant", content=result["reply"]))
    session.urgency = chatbot._max_level(session.urgency, result["urgency"])
    db.commit()
    return {"session_id": session.id, **result, "urgency": session.urgency}


@router.get("/sessions")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.created_at.desc()).limit(20)
    ).all()
    return [{"id": s.id, "urgency": s.urgency, "scan_id": s.scan_id, "created_at": iso(s.created_at)} for s in rows]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat session not found")
    return {
        "id": s.id,
        "urgency": s.urgency,
        "messages": [{"role": m.role, "content": m.content, "created_at": iso(m.created_at)} for m in s.messages],
    }
