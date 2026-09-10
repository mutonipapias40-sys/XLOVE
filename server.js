const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "XLOVE backend is running ❤️"
  });
});

app.listen(PORT, () => {
  console.log(`XLOVE backend running on port ${PORT}`);
});
