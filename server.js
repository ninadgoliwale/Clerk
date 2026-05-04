// Add these endpoints to your server.js (continuation)

// ============ ADD FUNDS (Admin only) ============
app.post('/api/admin/add-funds', requireAdmin, async (req, res) => {
    const { user_id, amount } = req.body;
    
    if (!amount || amount <= 0) {
        return res.json({ success: false, message: 'Invalid amount' });
    }
    
    try {
        // Try to find user by ID or username
        let query = `SELECT * FROM users WHERE id = $1 OR username = $1`;
        let user = await pool.query(query, [user_id]);
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        await pool.query(
            `UPDATE users SET virtual_balance = virtual_balance + $1 WHERE id = $2`,
            [amount, user.rows[0].id]
        );
        
        const newBalance = await pool.query(`SELECT virtual_balance FROM users WHERE id = $1`, [user.rows[0].id]);
        
        res.json({ 
            success: true, 
            message: `Added ₹${amount} to ${user.rows[0].username}. New balance: ₹${newBalance.rows[0].virtual_balance}`
        });
    } catch (error) {
        res.json({ success: false, message: 'Database error' });
    }
});

// ============ SEARCH USER (Admin only) ============
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

// ============ GET WITHDRAWALS (Admin only) ============
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

// ============ GET BETS (Admin only) ============
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

// ============ SERVE INDEX.HTML ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});