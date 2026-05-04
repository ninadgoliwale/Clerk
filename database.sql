-- CLERK CLUB Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15),
    virtual_balance INTEGER DEFAULT 100,
    total_bet INTEGER DEFAULT 0,
    total_win INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    telegram_username VARCHAR(100)
);

-- Game periods table
CREATE TABLE IF NOT EXISTS game_periods (
    id VARCHAR(50) PRIMARY KEY,
    winning_number INTEGER,
    winning_color VARCHAR(20),
    winning_big_small VARCHAR(10),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    result_revealed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    period_id VARCHAR(50) REFERENCES game_periods(id),
    amount INTEGER NOT NULL,
    predicted_number INTEGER,
    predicted_color VARCHAR(20),
    predicted_big_small VARCHAR(10),
    win_amount INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fake withdrawals table (always shows processing)
CREATE TABLE IF NOT EXISTS fake_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    upi_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'processing',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial game period
INSERT INTO game_periods (id, start_time, end_time, status)
VALUES (
    'WGO-1M-001',
    NOW(),
    NOW() + INTERVAL '1 minute',
    'active'
);