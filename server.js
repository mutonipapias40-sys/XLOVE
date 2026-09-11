const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Allow the XLOVE website to communicate with this backend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://xlove-as4y.onrender.com");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// PostgreSQL connection
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create users table
async function createUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      bio TEXT DEFAULT '',
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''
  `);

  console.log("Users table is ready.");
}

// Test backend
app.get("/", (req, res) => {
  res.json({
    message: "XLOVE backend is running ❤️"
  });
});

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, email and password are required."
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      "INSERT INTO users (username, email, password_hash, bio) VALUES ($1, $2, $3, $4)",
      [username, email, passwordHash, ""]
    );

    res.status(201).json({
      message: "Account created successfully."
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error. Please try again."
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const result = await pool.query(
      "SELECT id, username, email, password_hash, bio FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    res.json({
      message: "Login successful.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio || ""
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error. Please try again."
    });
  }
});

// Update profile
app.put("/api/profile", async (req, res) => {
  try {
    const { id, username, bio } = req.body;

    if (!id || !username) {
      return res.status(400).json({
        message: "User ID and username are required."
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET username = $1, bio = $2
       WHERE id = $3
       RETURNING id, username, email, bio`,
      [username, bio || "", id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.json({
      message: "Profile updated successfully.",
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error. Please try again."
    });
  }
});

// Start server
async function startServer() {
  try {
    await createUsersTable();

    app.listen(PORT, () => {
      console.log(`XLOVE backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();
