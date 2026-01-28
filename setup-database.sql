-- ============================================
-- TELEGRAM BOT DATABASE SCHEMA
-- ============================================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  points INT DEFAULT 0,
  referrals INT DEFAULT 0,
  referred_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  registered INT DEFAULT 0,
  joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create referral logs table for tracking referral history
CREATE TABLE IF NOT EXISTS referral_logs (
  id SERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  referred_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  points_awarded INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin action logs table
CREATE TABLE IF NOT EXISTS admin_logs (
  id SERIAL PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create gmail registrations table
CREATE TABLE IF NOT EXISTS gmail_registrations (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT,
  recovery_email TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_referral_logs_referrer ON referral_logs(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_logs_referred ON referral_logs(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_registrations_user_id ON gmail_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for gmail_registrations table
DROP TRIGGER IF EXISTS update_gmail_registrations_updated_at ON gmail_registrations;
CREATE TRIGGER update_gmail_registrations_updated_at
  BEFORE UPDATE ON gmail_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to add referral
CREATE OR REPLACE FUNCTION add_referral(ref_user_id BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET referrals = referrals + 1,
      points = points + 1
  WHERE user_id = ref_user_id;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (Optional - uncomment if using Supabase)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE referral_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gmail_registrations ENABLE ROW LEVEL SECURITY;
