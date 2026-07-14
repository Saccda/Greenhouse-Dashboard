"""
Create or reset a FarmOS login — run manually on the lab desktop.

    cd backend
    python scripts/create_user.py --username alice --role owner
    python scripts/create_user.py --list

Re-running with an existing username resets their password (doubles as
the reset flow — there's no separate reset command).
"""
import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import auth_service, user_service  # noqa: E402

ROLES = ("owner", "developer")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset a FarmOS login")
    parser.add_argument("--username")
    parser.add_argument("--role", choices=ROLES)
    parser.add_argument("--list", action="store_true", help="List existing usernames + roles")
    args = parser.parse_args()

    if args.list:
        users = user_service.list_users()
        if not users:
            print("No users created yet.")
        for u in users:
            print(f"  {u['username']:<20} {u['role']}")
        return

    if not args.username or not args.role:
        parser.error("--username and --role are required unless using --list")

    password = getpass.getpass("New password: ")
    confirm  = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords did not match — aborted.")
        return
    if len(password) < 8:
        print("Password must be at least 8 characters — aborted.")
        return

    salt_hex, hash_hex = auth_service.hash_password(password)
    user_service.upsert_user(args.username, args.role, salt_hex, hash_hex)
    print(f"Saved: {args.username} ({args.role})")


if __name__ == "__main__":
    main()
