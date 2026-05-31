"""Standalone migration script for medication_unit_specs."""
import asyncio
import asyncpg

DSN = "postgresql://cfarm:cfarm_local_2026@localhost:5432/cfarm_local"

async def migrate():
    conn = await asyncpg.connect(DSN)
    print('Connected to DB')

    # Create medication_unit_specs table
    await conn.execute('''
        CREATE TABLE IF NOT EXISTS medication_unit_specs (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            package_unit VARCHAR(50) NOT NULL,
            package_size DECIMAL(10,2) NOT NULL,
            base_unit VARCHAR(20) NOT NULL,
            dose_per_package INTEGER,
            dose_unit VARCHAR(20),
            notes TEXT,
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(product_id, package_unit)
        )
    ''')
    print('Created medication_unit_specs table')

    # Add base_unit column to products
    try:
        await conn.execute('ALTER TABLE products ADD COLUMN base_unit VARCHAR(20)')
        print('Added base_unit column to products')
    except Exception as e:
        print(f'base_unit column: {e}')

    # Insert medication unit specs for existing products
    specs = [
        (3, 'chai', 50, 'ml'),
        (4, 'chai', 250, 'gram'),
        (9, 'chai', 100, 'gram'),
        (10, 'chai', 100, 'ml'),
        (11, 'chai', 1000, 'ml'),
    ]
    for product_id, package_unit, package_size, base_unit in specs:
        await conn.execute('''
            INSERT INTO medication_unit_specs (product_id, package_unit, package_size, base_unit)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, package_unit) DO NOTHING
        ''', product_id, package_unit, package_size, base_unit)
        print(f'Inserted spec for product_id={product_id}')

    # Update products base_unit
    await conn.execute("UPDATE products SET base_unit = 'ml' WHERE id IN (3, 10, 11) AND (base_unit IS NULL OR base_unit = '')")
    await conn.execute("UPDATE products SET base_unit = 'gram' WHERE id IN (4, 9) AND (base_unit IS NULL OR base_unit = '')")
    print('Updated products base_unit')

    # Verify
    specs = await conn.fetch('SELECT * FROM medication_unit_specs')
    print(f'\nVerification - medication_unit_specs count: {len(specs)}')
    for s in specs:
        print(f"  product_id:{s['product_id']} {s['package_unit']} {s['package_size']}{s['base_unit']}")

    products = await conn.fetch("SELECT id, name, base_unit FROM products WHERE id IN (3,4,9,10,11)")
    print('\nProducts base_unit:')
    for p in products:
        print(f"  ID {p['id']}: {p['name']} - base_unit: {p['base_unit']}")

    await conn.close()
    print('\nMigration complete')

asyncio.run(migrate())