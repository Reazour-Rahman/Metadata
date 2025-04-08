const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

// Middleware to parse JSON
app.use(bodyParser.json());

const cors = require("cors");
app.use(cors());

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};
connectDB();

// Define a schema and model for images/items
const itemSchema = new mongoose.Schema({
  url: { type: String, required: true },
  id: { type: Number, required: true },
});
const Item = mongoose.model("Item", itemSchema);

// API endpoint: Get all items
app.get("/api/items", async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// API endpoint: Add item(s)
// This endpoint now handles both single-object uploads and bulk (array) uploads.
app.post("/api/items", async (req, res) => {
  try {
    // If the request body is an array, perform a bulk insert
    if (Array.isArray(req.body)) {
      const items = await Item.insertMany(req.body);
      return res.json(items);
    } else {
      // Otherwise, handle a single image upload
      const newItem = new Item({ url: req.body.url, id: req.body.id });
      const item = await newItem.save();
      return res.json(item);
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// API endpoint: Delete an item by its MongoDB _id
app.delete("/api/items/:id", async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item)
      return res.status(404).json({ message: "Item not found" });
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// API endpoint: Delete all images
app.delete("/api/items", async (req, res) => {
  try {
    await Item.deleteMany({});
    res.status(200).json({ message: "All images deleted successfully" });
  } catch (err) {
    console.error("Error deleting all images:", err);
    res.status(500).json({ error: "Failed to delete all images" });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
