"""Authentication utilities for STUDENT-IQ: PBKDF2 password hashing, JWT sessions, and bootstrap accounts."""
import hashlib
import hmac
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt

from src.database import get_user_by_email, list_users, save_user

logger = logging.getLogger(__name__)

# Keep an unset local-development secret out of source control. Tokens issued
# without an explicitly configured key are intentionally invalidated on restart.
JWT_SECRET = os.getenv("CAMPUS_JWT_SECRET") or secrets.token_urlsafe(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("CAMPUS_JWT_EXPIRE_MINUTES", "480"))  # Default 8 hours
VALID_ROLES = {"viewer", "analyst", "staff", "admin"}


def validate_runtime_auth_configuration() -> None:
    """Fail closed if Firebase sessions would use a missing or placeholder key."""
    if os.getenv("CAMPUS_AUTH_MODE", "local").strip().lower() != "firebase":
        return
    configured_secret = os.getenv("CAMPUS_JWT_SECRET", "")
    if (len(configured_secret.encode("utf-8")) < 32
            or configured_secret.strip().lower().startswith(("replace-", "your-", "<"))):
        raise RuntimeError(
            "Firebase authentication requires a deployment-specific CAMPUS_JWT_SECRET "
            "of at least 32 bytes. Generate and store it in the backend secret manager."
        )


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a unique random salt."""
    if not password or not isinstance(password, str):
        raise ValueError("Password must be a non-empty string")
    salt = secrets.token_bytes(16)
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against a PBKDF2-HMAC-SHA256 modular hash."""
    if not password or not hashed:
        return False
    try:
        scheme, iters_str, salt_hex, hash_hex = hashed.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iters_str)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(derived, expected)
    except Exception:
        return False


def create_access_token(
    user_email: str,
    user_name: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
    identity_provider: str = "local",
) -> str:
    """Create a signed, expiring JWT access token."""
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role '{role}' for access token")

    now = datetime.now(timezone.utc)
    delta = expires_delta or timedelta(minutes=JWT_EXPIRE_MINUTES)
    expire = now + delta

    payload = {
        "sub": user_email.lower(),
        "name": user_name,
        "role": role,
        "type": "user_session",
        "identity_provider": identity_provider,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and verify a signed JWT access token.

    Raises:
        jwt.ExpiredSignatureError: if the token has expired.
        jwt.InvalidTokenError: if the token signature or claims are invalid.
    """
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    """Validate user credentials against stored password hash.

    Returns user dict if valid and active, None otherwise.
    """
    if not email or not password:
        return None
    user = get_user_by_email(email)
    if not user:
        return None
    if not user.get("is_active", 1):
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return {
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }


def bootstrap_accounts(allow_dev_defaults: bool = True):
    """Bootstrap initial user accounts from environment variables.

    Configuration options:
    - CAMPUS_BOOTSTRAP_USERS: JSON array of user objects:
      [{"email": "...", "name": "...", "password": "...", "role": "admin"}]
    - If CAMPUS_BOOTSTRAP_USERS is not set and users table is empty,
      safe local development demo accounts are initialized if CAMPUS_DEV_ACCOUNTS is not disabled.
    """
    configured_raw = os.getenv("CAMPUS_BOOTSTRAP_USERS")
    if configured_raw:
        try:
            accounts = json.loads(configured_raw)
            if isinstance(accounts, list):
                for acc in accounts:
                    email = str(acc.get("email", "")).strip().lower()
                    name = str(acc.get("name", "User")).strip()
                    password = str(acc.get("password", ""))
                    role = str(acc.get("role", "viewer")).strip().lower()
                    if email and password and role in VALID_ROLES:
                        save_user(email, name, hash_password(password), role)
                return
        except Exception as exc:
            logger.warning("Failed to parse CAMPUS_BOOTSTRAP_USERS: %s", exc)

    # Check individual bootstrap admin env vars
    admin_email = os.getenv("CAMPUS_BOOTSTRAP_ADMIN_EMAIL")
    admin_password = os.getenv("CAMPUS_BOOTSTRAP_ADMIN_PASSWORD")
    if admin_email and admin_password:
        save_user(
            admin_email.strip().lower(),
            os.getenv("CAMPUS_BOOTSTRAP_ADMIN_NAME", "Administrator"),
            hash_password(admin_password),
            "admin",
        )
        return

    # If the users table is completely empty, provide standard local dev accounts
    # so local developers and competition judges can immediately test each role.
    enable_dev_accounts = allow_dev_defaults and os.getenv("CAMPUS_DEV_ACCOUNTS", "true").lower() in ("true", "1", "yes")
    if enable_dev_accounts and len(list_users()) == 0:
        default_dev_users = [
            {"email": "admin@campus.edu", "name": "Campus Administrator", "password": "AdminPassword123!", "role": "admin"},
            {"email": "staff@campus.edu", "name": "Academic Staff", "password": "StaffPassword123!", "role": "staff"},
            {"email": "analyst@campus.edu", "name": "Institutional Analyst", "password": "AnalystPassword123!", "role": "analyst"},
            {"email": "viewer@campus.edu", "name": "Campus Observer", "password": "ViewerPassword123!", "role": "viewer"},
        ]
        for user in default_dev_users:
            save_user(user["email"], user["name"], hash_password(user["password"]), user["role"])
