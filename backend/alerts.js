import express from "express";
import { pool } from "./db.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

router.get("/alerts", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT alerts.*, sites.name, sites.url
       FROM alerts
       JOIN sites ON alerts.site_id = sites.id
       WHERE sites.user_id = ?
       ORDER BY alerts.created_at DESC`,
      [req.user.id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/alerts/:id/read", authenticateToken, async (req, res) => {
  await pool.query(
    `UPDATE alerts
     JOIN sites ON alerts.site_id = sites.id
     SET alerts.is_read = TRUE
     WHERE alerts.id = ? AND sites.user_id = ?`,
    [req.params.id, req.user.id],
  );

  res.json({ success: true });
});


router.delete("/alerts", authenticateToken, async (req, res) => {
  await pool.query(
    `DELETE alerts
     FROM alerts
     JOIN sites ON alerts.site_id = sites.id
     WHERE sites.user_id = ?`,
    [req.user.id],
  );

  res.json({ success: true });
});

router.delete("/alerts/archive", authenticateToken, async (req, res) => {
  await pool.query(
    `DELETE alerts
     FROM alerts
     JOIN sites ON alerts.site_id = sites.id
     WHERE sites.user_id = ? AND alerts.is_read = TRUE`,
    [req.user.id],
  );

  res.json({ success: true });
});

router.delete("/alerts/:id", authenticateToken, async (req, res) => {
  await pool.query(
    `DELETE alerts
     FROM alerts
     JOIN sites ON sites.id = alerts.site_id
     WHERE alerts.id = ? AND sites.user_id = ?`,
    [req.params.id, req.user.id],
  );

  res.json({ success: true });
});

export default router;
