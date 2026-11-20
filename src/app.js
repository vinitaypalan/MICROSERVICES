const express = require("express");
const pool = require("./db");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

app.get("/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    response.status(503).json({ status: "unavailable" });
  }
});

app.get("/products", async (_request, response) => {
  try {
    const [products] = await pool.query(
      "SELECT id, name, description, price FROM products ORDER BY id"
    );
    response.json(products);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    response.status(500).json({ error: "Unable to retrieve products" });
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

module.exports = app;
