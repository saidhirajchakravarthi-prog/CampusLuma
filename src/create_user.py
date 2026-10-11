"""CLI utility to safely create or update CampusLuma user accounts."""
import argparse
import secrets
import sys

from src.auth import VALID_ROLES, hash_password
from src.database import DB_PATH, initialize, promote_existing_viewer_to_admin, save_user


def main():
    parser = argparse.ArgumentParser(description="Create or update a CampusLuma user account")
    parser.add_argument("--email", required=True, help="User email address")
    parser.add_argument("--name", help="User display name")
    parser.add_argument("--password", help="Local-mode password (will be hashed)")
    parser.add_argument("--firebase-only", action="store_true", help="Provision a role for a Firebase-managed account; no local password is used")
    parser.add_argument(
        "--promote-existing-firebase", action="store_true",
        help="Promote an existing active Viewer row to admin; refuses missing or ambiguous matches and never creates users",
    )
    parser.add_argument("--role", required=True, choices=sorted(VALID_ROLES), help="Account role")

    args = parser.parse_args()

    if args.promote_existing_firebase:
        if args.role != "admin":
            parser.error("--promote-existing-firebase requires --role admin")
        if args.firebase_only or args.password or args.name:
            parser.error("--promote-existing-firebase cannot be combined with --firebase-only, --password, or --name")
        if not DB_PATH.is_file():
            parser.error(f"Database does not exist at {DB_PATH}; no database was created")

        print(f"Target account: {args.email.strip()}")
        print(f"Database: {DB_PATH}")
        confirmation = input("Type PROMOTE to update this existing active Viewer account to admin: ")
        if confirmation != "PROMOTE":
            print("Promotion cancelled; no account was changed.")
            return
        try:
            result = promote_existing_viewer_to_admin(args.email)
        except ValueError as exc:
            parser.error(str(exc))
        if result == "already_admin":
            print("The existing account is already an active admin; no account was changed.")
        else:
            print("Updated the existing account role from viewer to admin. No user was created.")
        return

    if not args.name:
        parser.error("--name is required unless --promote-existing-firebase is used")
    if args.firebase_only and args.password:
        parser.error("--password cannot be used with --firebase-only")
    if not args.firebase_only and (not args.password or len(args.password) < 6):
        print("Error: provide --password with at least 6 characters, or use --firebase-only", file=sys.stderr)
        sys.exit(1)

    initialize()
    # Keep the legacy NOT NULL password-hash schema while ensuring Firebase mode
    # never stores a usable local credential for Firebase-provisioned accounts.
    hashed = hash_password(secrets.token_urlsafe(48) if args.firebase_only else args.password)
    save_user(args.email, args.name, hashed, args.role)
    provider = "Firebase" if args.firebase_only else "local password"
    print(f"Successfully saved {provider} role mapping for '{args.email}' ({args.role}).")


if __name__ == "__main__":
    main()

