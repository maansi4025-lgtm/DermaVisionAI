from ..config import get_settings

settings = get_settings()


def verify_google_token(credential: str) -> dict:
    """Verify a Google Identity Services ID token (signature, expiry, audience). Raises ValueError if invalid."""
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(credential, g_requests.Request(), settings.google_client_id)
