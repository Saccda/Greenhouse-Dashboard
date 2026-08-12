"""
One-off cleanup — run manually on the lab desktop, once.

Any account that self-registered *before* per-user farm access existed has
no `farms` value stored at all, which the backend treats as unrestricted —
full read access to every farm, including ones it was never approved for.
New registrations already default to farms=[] (see nothing until an owner
grants access); this just catches accounts left over from before that.

    cd backend
    python scripts/restrict_pending_farms.py            # dry run — lists what would change
    python scripts/restrict_pending_farms.py --apply     # actually makes the change

Only touches accounts that are both role="pending" AND farms=None (truly
unrestricted) — a pending account someone already deliberately scoped to a
specific farm, or already correctly set to farms=[], is left untouched.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import user_service  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Restrict unreviewed pending accounts to zero farms")
    parser.add_argument("--apply", action="store_true", help="Actually make the change (default is a dry run)")
    args = parser.parse_args()

    affected = [
        u for u in user_service.list_users()
        if u["role"] == "pending" and u.get("farms") is None
    ]

    if not affected:
        print("Nothing to do — no pending account currently has unrestricted farm access.")
        return

    for u in affected:
        print(f"  {u['username']:<20} pending, currently unrestricted -> would set farms=[]")

    if not args.apply:
        print(f"\n{len(affected)} account(s) would be changed. Re-run with --apply to actually make the change.")
        return

    for u in affected:
        user_service.set_farms(u["username"], [])
    print(f"\nDone - restricted {len(affected)} account(s) to farms=[].")


if __name__ == "__main__":
    main()
