"""Run all migration scripts."""
import asyncio
import asyncpg
import sys
from urllib.parse import quote_plus

async def run_scripts():
    # Get password from command line or use default
    password = sys.argv[1] if len(sys.argv) > 1 else "postgres"

    # Connect as postgres
    encoded_password = quote_plus(password)
    dsn = f"postgresql://postgres:{encoded_password}@127.0.0.1:5432/cfarm_local"

    try:
        conn = await asyncpg.connect(dsn)
        print(f"Connected as postgres!")
    except Exception as e:
        print(f"Cannot connect: {e}")
        print("Please provide postgres password as argument:")
        print("  python run_all_migrations.py <postgres_password>")
        return

    scripts = [
        "006_sync_config.sql",
        "007_sync_triggers.sql",
        "008_fix_sync_compatibility.sql"
    ]

    for script in scripts:
        print(f"\n=== Running {script} ===")
        sql = None
        try:
            with open(f"scripts/{script}", "r", encoding="utf-8") as f:
                sql = f.read()
            # Split by semicolons and execute each statement
            statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
            for stmt in statements:
                try:
                    await conn.execute(stmt)
                except Exception as st:
                    # Ignore if column already exists
                    if "already exists" in str(st).lower():
                        pass
                    else:
                        print(f"  Warning: {st}")
            print(f"Done: {script}")
        except FileNotFoundError:
            print(f"  File not found: {script}")
        except Exception as e:
            print(f"  Error: {e}")

    await conn.close()
    print("\n=== All migrations complete! ===")

if __name__ == "__main__":
    asyncio.run(run_scripts())