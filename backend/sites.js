import express from "express";
import { pool } from "./db.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

router.get("/sites", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/sites", authenticateToken, async (req, res) => {
  let { name, url, css_selector, interval } = req.body;

  if (!url.includes("http")) url = "https://" + url;

  const checkSeconds = interval || 600;

  const [result] = await pool.query(
    "INSERT INTO sites (user_id, name, url, css_selector, check_interval_seconds) VALUES (?, ?, ?, ?, ?)",
    [req.user.id, name, url, css_selector, checkSeconds],
  );

  res.json({ id: result.insertId });
});

router.delete("/sites/:id", authenticateToken, async (req, res) => {
  await pool.query(
    "DELETE FROM sites WHERE id = ? AND user_id = ?",
    [req.params.id, req.user.id],
  );

  res.json({ success: true });
});

router.patch("/sites/:id/freeze", authenticateToken, async (req, res) => {
  try {
    const { is_frozen } = req.body;

    await pool.query(
      "UPDATE sites SET is_frozen = ? WHERE id = ? AND user_id = ?",
      [is_frozen, req.params.id, req.user.id],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/sites/:id", authenticateToken, async (req, res) => {
  try {
    const { name, check_interval_seconds } = req.body;

    await pool.query(
      'UPDATE sites SET name = ?, check_interval_seconds = ?, status = "active", consecutive_errors = 0, last_error = NULL WHERE id = ? AND user_id = ?',
      [name, check_interval_seconds, req.params.id, req.user.id],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
