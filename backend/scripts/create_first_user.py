"""
One-time bootstrap: create the first ("owner") user account.

Implementation Plan Section 1.4 — since auth is hand-rolled (no Django
`createsuperuser` equivalent), this script is run once per environment
(dev/staging/prod), immediately after `alembic upgrade head`, before the API
is used for anything else. It attaches the new user to the "owner" Role
seeded by alembic/versions/0002_seed_data.py.

Usage:
    python -m scripts.create_first_user --username owner --password "change-me"

Or omit --password to be prompted (so it never lands in shell history).
"""
import asyncio

import typer
from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import Role, User

app = typer.Typer()


async def _create_user(username: str, password: str, role_name: str) -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none() is not None:
            typer.echo(f"User '{username}' already exists — aborting.")
            raise typer.Exit(code=1)

        role_result = await db.execute(select(Role).where(Role.name == role_name))
        role = role_result.scalar_one_or_none()
        if role is None:
            typer.echo(
                f"Role '{role_name}' not found — run `alembic upgrade head` first "
                "(it's seeded by migration 0002)."
            )
            raise typer.Exit(code=1)

        user = User(username=username, hashed_password=hash_password(password), role_id=role.id)
        db.add(user)
        await db.commit()
        typer.echo(f"Created user '{username}' with role '{role_name}'.")


@app.command()
def main(
    username: str = typer.Option(..., prompt=True),
    password: str = typer.Option(..., prompt=True, hide_input=True, confirmation_prompt=True),
    role: str = typer.Option("owner", help="Role name to attach (seeded roles: 'owner')"),
) -> None:
    asyncio.run(_create_user(username, password, role))


if __name__ == "__main__":
    app()
