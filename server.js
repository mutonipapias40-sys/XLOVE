const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// =====================================================
// CORS
// =====================================================

app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    "https://xlove-as4y.onrender.com"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// =====================================================
// POSTGRESQL CONNECTION
// =====================================================

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

// =====================================================
// CREATE DATABASE TABLES
// =====================================================

async function createTables() {

  // USERS TABLE
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

  // Make sure bio exists
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''
  `);

  // MESSAGES TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      message TEXT NOT NULL,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // LIKES TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,

      liker_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      liked_user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(liker_id, liked_user_id)
    )
  `);

  console.log("Users table is ready.");
  console.log("Messages table is ready.");
  console.log("Likes table is ready.");
}

// =====================================================
// TEST BACKEND
// =====================================================

app.get("/", (req, res) => {

  res.json({
    message: "XLOVE backend is running"
  });

});

// =====================================================
// USERS
// =====================================================

// Get users for Discover
app.get("/api/users", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        id,
        username,
        bio,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      users: result.rows
    });

  } catch (error) {

    console.error("Get users error:", error);

    res.status(500).json({
      message: "Unable to load users."
    });

  }

});

// =====================================================
// REGISTER
// =====================================================

app.post("/api/register", async (req, res) => {

  try {

    const {
      username,
      email,
      password
    } = req.body;

    if (!username || !email || !password) {

      return res.status(400).json({
        message:
          "Username, email and password are required."
      });

    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {

      return res.status(409).json({
        message:
          "An account with this email already exists."
      });

    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users
       (username, email, password_hash, bio)
       VALUES ($1, $2, $3, $4)`,
      [
        username,
        email,
        passwordHash,
        ""
      ]
    );

    res.status(201).json({
      message:
        "Account created successfully."
    });

  } catch (error) {

    console.error(
      "Register error:",
      error
    );

    res.status(500).json({
      message:
        "Server error. Please try again."
    });

  }

});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", async (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;

    if (!email || !password) {

      return res.status(400).json({
        message:
          "Email and password are required."
      });

    }

    const result = await pool.query(
      `SELECT
        id,
        username,
        email,
        password_hash,
        bio
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {

      return res.status(401).json({
        message:
          "Invalid email or password."
      });

    }

    const user = result.rows[0];

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password_hash
      );

    if (!passwordMatch) {

      return res.status(401).json({
        message:
          "Invalid email or password."
      });

    }

    res.json({

      message:
        "Login successful.",

      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio || ""
      }

    });

  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    res.status(500).json({
      message:
        "Server error. Please try again."
    });

  }

});

// =====================================================
// UPDATE PROFILE
// =====================================================

app.put("/api/profile", async (req, res) => {

  try {

    const {
      id,
      username,
      bio
    } = req.body;

    if (!id || !username) {

      return res.status(400).json({
        message:
          "User ID and username are required."
      });

    }

    const result = await pool.query(
      `UPDATE users
       SET username = $1,
           bio = $2
       WHERE id = $3
       RETURNING id, username, email, bio`,
      [
        username,
        bio || "",
        id
      ]
    );

    if (result.rows.length === 0) {

      return res.status(404).json({
        message:
          "User not found."
      });

    }

    res.json({

      message:
        "Profile updated successfully.",

      user:
        result.rows[0]

    });

  } catch (error) {

    console.error(
      "Profile update error:",
      error
    );

    res.status(500).json({
      message:
        "Server error. Please try again."
    });

  }

});

// =====================================================
// MESSAGES
// =====================================================

// Send message
app.post("/api/messages", async (req, res) => {

  try {

    const {
      sender_id,
      receiver_id,
      message
    } = req.body;

    if (
      !sender_id ||
      !receiver_id ||
      !message
    ) {

      return res.status(400).json({
        message:
          "Sender, receiver and message are required."
      });

    }

    const cleanMessage =
      String(message).trim();

    if (!cleanMessage) {

      return res.status(400).json({
        message:
          "Message cannot be empty."
      });

    }

    // Check sender
    const sender =
      await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [sender_id]
      );

    if (sender.rows.length === 0) {

      return res.status(404).json({
        message:
          "Sender not found."
      });

    }

    // Check receiver
    const receiver =
      await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [receiver_id]
      );

    if (receiver.rows.length === 0) {

      return res.status(404).json({
        message:
          "Receiver not found."
      });

    }

    const result =
      await pool.query(
        `INSERT INTO messages
         (sender_id, receiver_id, message)
         VALUES ($1, $2, $3)
         RETURNING
           id,
           sender_id,
           receiver_id,
           message,
           created_at`,
        [
          sender_id,
          receiver_id,
          cleanMessage
        ]
      );

    res.status(201).json({

      message:
        "Message sent successfully.",

      data:
        result.rows[0]

    });

  } catch (error) {

    console.error(
      "Send message error:",
      error
    );

    res.status(500).json({
      message:
        "Unable to send message."
    });

  }

});

// Get conversation
app.get("/api/messages", async (req, res) => {

  try {

    const {
      user1,
      user2
    } = req.query;

    if (!user1 || !user2) {

      return res.status(400).json({
        message:
          "user1 and user2 are required."
      });

    }

    const result =
      await pool.query(
        `
        SELECT
          m.id,
          m.sender_id,
          m.receiver_id,
          m.message,
          m.created_at,

          sender.username
            AS sender_username,

          receiver.username
            AS receiver_username

        FROM messages m

        JOIN users sender
          ON sender.id = m.sender_id

        JOIN users receiver
          ON receiver.id = m.receiver_id

        WHERE
          (
            m.sender_id = $1
            AND
            m.receiver_id = $2
          )

          OR

          (
            m.sender_id = $2
            AND
            m.receiver_id = $1
          )

        ORDER BY m.created_at ASC
        `,
        [
          user1,
          user2
        ]
      );

    res.json({
      messages:
        result.rows
    });

  } catch (error) {

    console.error(
      "Get messages error:",
      error
    );

    res.status(500).json({
      message:
        "Unable to load messages."
    });

  }

});

// Get all conversations
app.get(
  "/api/conversations/:userId",
  async (req, res) => {

    try {

      const {
        userId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            m.id,
            m.sender_id,
            m.receiver_id,
            m.message,
            m.created_at,

            CASE
              WHEN m.sender_id = $1
              THEN receiver.username
              ELSE sender.username
            END AS other_username,

            CASE
              WHEN m.sender_id = $1
              THEN receiver.id
              ELSE sender.id
            END AS other_user_id

          FROM messages m

          JOIN users sender
            ON sender.id = m.sender_id

          JOIN users receiver
            ON receiver.id = m.receiver_id

          WHERE
            m.sender_id = $1
            OR
            m.receiver_id = $1

          ORDER BY m.created_at DESC
          `,
          [userId]
        );

      res.json({
        conversations:
          result.rows
      });

    } catch (error) {

      console.error(
        "Get conversations error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load conversations."
      });

    }

  }
);

// =====================================================
// LIKES
// =====================================================

// Add Like
app.post("/api/likes", async (req, res) => {

  try {

    const {
      liker_id,
      liked_user_id
    } = req.body;

    if (
      !liker_id ||
      !liked_user_id
    ) {

      return res.status(400).json({
        message:
          "liker_id and liked_user_id are required."
      });

    }

    if (
      Number(liker_id) ===
      Number(liked_user_id)
    ) {

      return res.status(400).json({
        message:
          "You cannot like your own profile."
      });

    }

    // Check liker
    const liker =
      await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [liker_id]
      );

    if (liker.rows.length === 0) {

      return res.status(404).json({
        message:
          "Liker not found."
      });

    }

    // Check liked user
    const likedUser =
      await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [liked_user_id]
      );

    if (likedUser.rows.length === 0) {

      return res.status(404).json({
        message:
          "Liked user not found."
      });

    }

    // Save Like
    const result =
      await pool.query(
        `
        INSERT INTO likes
          (liker_id, liked_user_id)

        VALUES
          ($1, $2)

        ON CONFLICT
          (liker_id, liked_user_id)

        DO NOTHING

        RETURNING
          id,
          liker_id,
          liked_user_id,
          created_at
        `,
        [
          liker_id,
          liked_user_id
        ]
      );

    res.status(201).json({

      message:
        "Profile liked successfully.",

      liked:
        true,

      data:
        result.rows[0] || null

    });

  } catch (error) {

    console.error(
      "Like error:",
      error
    );

    res.status(500).json({
      message:
        "Unable to like profile."
    });

  }

});

// Remove Like
app.delete("/api/likes", async (req, res) => {

  try {

    const {
      liker_id,
      liked_user_id
    } = req.body;

    if (
      !liker_id ||
      !liked_user_id
    ) {

      return res.status(400).json({
        message:
          "liker_id and liked_user_id are required."
      });

    }

    await pool.query(
      `
      DELETE FROM likes
      WHERE
        liker_id = $1
        AND
        liked_user_id = $2
      `,
      [
        liker_id,
        liked_user_id
      ]
    );

    res.json({

      message:
        "Like removed successfully.",

      liked:
        false

    });

  } catch (error) {

    console.error(
      "Remove like error:",
      error
    );

    res.status(500).json({
      message:
        "Unable to remove like."
    });

  }

});

// Check Like
app.get("/api/likes/check", async (req, res) => {

  try {

    const {
      liker_id,
      liked_user_id
    } = req.query;

    if (
      !liker_id ||
      !liked_user_id
    ) {

      return res.status(400).json({
        message:
          "liker_id and liked_user_id are required."
      });

    }

    const result =
      await pool.query(
        `
        SELECT id
        FROM likes
        WHERE
          liker_id = $1
          AND
          liked_user_id = $2
        LIMIT 1
        `,
        [
          liker_id,
          liked_user_id
        ]
      );

    res.json({

      liked:
        result.rows.length > 0

    });

  } catch (error) {

    console.error(
      "Check like error:",
      error
    );

    res.status(500).json({
      message:
        "Unable to check like."
    });

  }

});

// Get likes received by a user
app.get(
  "/api/likes/received/:userId",
  async (req, res) => {

    try {

      const {
        userId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            l.id,
            l.liker_id,
            l.liked_user_id,
            l.created_at,
            u.username AS liker_username

          FROM likes l

          JOIN users u
            ON u.id = l.liker_id

          WHERE
            l.liked_user_id = $1

          ORDER BY
            l.created_at DESC
          `,
          [userId]
        );

      res.json({
        likes:
          result.rows
      });

    } catch (error) {

      console.error(
        "Get received likes error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load likes."
      });

    }

  }
);

// =====================================================
// START SERVER
// =====================================================

async function startServer() {

  try {

    await createTables();

    app.listen(
      PORT,
      () => {

        console.log(
          `XLOVE backend running on port ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "Database connection failed:",
      error
    );

    process.exit(1);
  }

}

startServer();
