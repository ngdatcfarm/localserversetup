-- Create read-only user for chatbot AI
-- Run as postgres superuser

-- 1. Create user
CREATE ROLE chatbot_read WITH LOGIN PASSWORD 'chatbot_read_only_2026';

-- 2. Grant connect to database
GRANT CONNECT ON DATABASE cfarm_local TO chatbot_read;

-- 3. Grant USAGE on schema
GRANT USAGE ON SCHEMA public TO chatbot_read;

-- 4. Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chatbot_read;

-- 5. Grant SELECT on all future tables (auto)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chatbot_read;

-- 6. Verify
-- \du chatbot_read
-- \dp (to see permissions)

-- To revoke if needed:
-- DROP ROLE chatbot_read;