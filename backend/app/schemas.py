from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: str | None = None
    scan_id: str | None = None
    lang: str = "en"  # BCP-47 prefix, e.g. "en", "hi"


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=2000)
    password: str = Field(min_length=8, max_length=128)


class GoogleIn(BaseModel):
    credential: str = Field(min_length=10, max_length=5000)
