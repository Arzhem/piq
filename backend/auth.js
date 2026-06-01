import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

import { pool } from "./db.js";
import { JWT_SECRET } from "./config.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    error: "Too many attempts from this IP. Please try again later.",
  },
});

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  const token =
    (authHeader && authHeader.split(" ")[1]) ||
    req.query.token;

  if (!token) {
    return res.status(401).json({
      error: "Access denied.",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        error: "Invalid session token.",
      });
    }

    req.user = user;
    next();
  });
}

router.post("/register", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [username, hashedPassword],
    );

    res.json({
      success: true,
      userId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({
      error: "Username is unavailable.",
    });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );

    const user = rows[0];

    if (
      user &&
      (await bcrypt.compare(password, user.password_hash))
    ) {
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
        },
        JWT_SECRET,
        {
          expiresIn: "7d",
        },
      );

      res.json({
        token,
        username: user.username,
      });
    } else {
      res.status(401).json({
        error: "Invalid credentials.",
      });
    }
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;
