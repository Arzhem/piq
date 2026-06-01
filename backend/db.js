import mysql from "mysql2/promise";
import { DB_CONFIG } from "./config.js";

export const pool = mysql.createPool(DB_CONFIG);

export async function initDatabase() {
  const connection = await pool.getConnection();

  try {
    await connection.query("SELECT 1");
    console.log("Database connection established.");
  } finally {
    connection.release();
  }
}
