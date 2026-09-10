const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "XLOVE backend is running ❤️"
  });
});

// Test registration endpoint
app.post("/api/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      message: "Username, email and password are required."
    });
  }

  res.status(201).json({
    message: "Registration request received successfully.",
    username,
    email
  });
});

// Test login endpoint
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required."
    });
  }

  res.json({
    message: "Login request received successfully.",
    email
  });
});

app.listen(PORT, () => {
  console.log(`XLOVE backend running on port ${PORT}`);
});
