-- Migration: Assign existing data to owner and add constraints
-- Run AFTER the owner registers and you have their UUID
-- Replace 'OWNER_UUID' with the actual UUID from auth.users

-- Disable triggers that reference updated_at (some tables may not have that column)
ALTER TABLE feeds DISABLE TRIGGER USER;
ALTER TABLE feed_items DISABLE TRIGGER USER;
ALTER TABLE preferences DISABLE TRIGGER USER;
ALTER TABLE api_keys DISABLE TRIGGER USER;
ALTER TABLE annotations DISABLE TRIGGER USER;

-- Assign all unowned data to the owner
UPDATE feeds SET user_id = '5e15bb0a-65cc-4332-ba0a-7ded99376639' WHERE user_id IS NULL;
UPDATE feed_items SET user_id = '5e15bb0a-65cc-4332-ba0a-7ded99376639' WHERE user_id IS NULL;
UPDATE preferences SET user_id = '5e15bb0a-65cc-4332-ba0a-7ded99376639' WHERE user_id IS NULL;
UPDATE api_keys SET user_id = '5e15bb0a-65cc-4332-ba0a-7ded99376639' WHERE user_id IS NULL;
UPDATE annotations SET user_id = '5e15bb0a-65cc-4332-ba0a-7ded99376639' WHERE user_id IS NULL;

-- Re-enable triggers
ALTER TABLE feeds ENABLE TRIGGER USER;
ALTER TABLE feed_items ENABLE TRIGGER USER;
ALTER TABLE preferences ENABLE TRIGGER USER;
ALTER TABLE api_keys ENABLE TRIGGER USER;
ALTER TABLE annotations ENABLE TRIGGER USER;

-- Make user_id NOT NULL
ALTER TABLE feeds ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE feed_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE api_keys ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE annotations ALTER COLUMN user_id SET NOT NULL;

-- New unique constraints with user_id
ALTER TABLE feeds ADD CONSTRAINT feeds_url_env_user_unique UNIQUE(url, env, user_id);
ALTER TABLE preferences ADD CONSTRAINT preferences_key_env_user_unique UNIQUE(key, env, user_id);
