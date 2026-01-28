-- ============================================
-- TELEGRAM BOT DATABASE SCHEMA (Supabase)
-- ============================================

-- Drop existing tables if they exist (for clean rebuild)
DROP TABLE IF EXISTS gmail_registrations CASCADE;
DROP TABLE IF EXISTS admin_logs CASCADE;
DROP TABLE IF EXISTS referral_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table (MUST be first - no foreign keys to other tables)
CREATE TABLE users (
  user_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  points INT DEFAULT 0,
  referrals INT DEFAULT 0,
  referred_by BIGINT,
  registered INT DEFAULT 0,
  joined TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint for self-referencing after table creation
ALTER TABLE users ADD CONSTRAINT fk_users_referred_by 
  FOREIGN KEY (referred_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- Create referral logs table for tracking referral history
CREATE TABLE referral_logs (
  id BIGSERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  referred_user_id BIGINT NOT NULL,
  points_awarded INT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_referral_logs_referrer FOREIGN KEY (referrer_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_referral_logs_referred FOREIGN KEY (referred_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create admin action logs table
CREATE TABLE admin_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_logs_admin_id FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create gmail registrations table
CREATE TABLE gmail_registrations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT,
  recovery_email TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gmail_registrations_user_id FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_users_referred_by ON users(referred_by);
CREATE INDEX idx_users_points ON users(points DESC);
CREATE INDEX idx_referral_logs_referrer ON referral_logs(referrer_id);
CREATE INDEX idx_referral_logs_referred ON referral_logs(referred_user_id);
CREATE INDEX idx_referral_logs_created_at ON referral_logs(created_at DESC);
CREATE INDEX idx_gmail_registrations_user_id ON gmail_registrations(user_id);
CREATE INDEX idx_gmail_registrations_email ON gmail_registrations(email);
CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for gmail_registrations table
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

-- Supabase RLS Policies (Enable if needed)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE referral_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gmail_registrations ENABLE ROW LEVEL SECURITY;
