/* const express = require("express");
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
 */



const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

// Middleware
app.use(bodyParser.json());
const cors = require("cors");
app.use(cors());

// MongoDB connect
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

/* =========================
   MODEL (inline schema)
   ========================= */
const itemSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    id: { type: Number, required: false },    // was required; now we auto-set = seq
    seq: { type: Number, index: true, unique: true, sparse: true }, // strict serial
  },
  { timestamps: true } // not strictly needed, but helpful later
);
const Item = mongoose.model("Item", itemSchema);

/* =========================
   Helpers
   ========================= */

// _id থেকে seconds timestamp (fallback ordering/migration)
function objectIdTime(oid) {
  if (typeof oid !== "string" || oid.length < 8) return 0;
  const ts = parseInt(oid.substring(0, 8), 16);
  return Number.isFinite(ts) ? ts : 0;
}

// বর্তমান max(seq) + 1 আনো (simple; বেশিরভাগ কেসে যথেষ্ট)
async function getNextSeqStart() {
  const doc = await Item.findOne({ seq: { $ne: null } })
    .sort({ seq: -1 })
    .select("seq")
    .lean();
  return (doc?.seq ?? 0) + 1;
}

/* =========================
   ROUTES
   ========================= */

// GET: সব items deterministic order-এ
app.get("/api/items", async (req, res) => {
  try {
    // চাইলে limit?after যোগ করতে পারো; এখানে simple version
    const items = await Item.find().sort({ seq: 1, id: 1, _id: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST: single বা bulk – seq/id assign করে সেভ
app.post("/api/items", async (req, res) => {
  try {
    // BULK
    if (Array.isArray(req.body)) {
      const data = req.body.map((it) => ({
        url: it.url,
        // prefer client seq/id if valid integers
        seq: Number.isInteger(it.seq) ? it.seq : null,
        id: Number.isInteger(it.id) ? it.id : null,
      }));

      // যেগুলোতে seq নেই সেগুলোর জন্য একবারেই রেঞ্জ রিজার্ভ করো
      const needAuto = data.some((x) => !Number.isInteger(x.seq));
      let start = null;
      if (needAuto) start = await getNextSeqStart();

      let cursor = start;
      const payload = data.map((it) => {
        if (Number.isInteger(it.seq)) {
          return {
            url: it.url,
            seq: it.seq,
            id: Number.isInteger(it.id) ? it.id : it.seq, // id==seq for compat
          };
        } else {
          const seq = cursor++;
          return { url: it.url, seq, id: seq };
        }
      });

      const items = await Item.insertMany(payload, { ordered: true });
      return res.json(items);
    }

    // SINGLE
    const b = req.body || {};
    let seq = Number.isInteger(b.seq) ? b.seq : null;
    let id = Number.isInteger(b.id) ? b.id : null;

    if (!Number.isInteger(seq)) seq = await getNextSeqStart();
    if (!Number.isInteger(id)) id = seq; // keep id == seq (backward-compat)

    const newItem = new Item({ url: b.url, seq, id });
    const item = await newItem.save();
    return res.json(item);
  } catch (err) {
    console.error("Add item(s) error:", err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE by _id
app.delete("/api/items/:id", async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE all
app.delete("/api/items", async (req, res) => {
  try {
    await Item.deleteMany({});
    res.status(200).json({ message: "All images deleted successfully" });
  } catch (err) {
    console.error("Error deleting all images:", err);
    res.status(500).json({ error: "Failed to delete all images" });
  }
});

/* ==================================================
   (ঐচ্ছিক) একবারের জন্য MIGRATION endpoint:
   পুরোনো ডকগুলোতে seq নেই → _id টাইম ASC ধরে seq সেট করবে
   নিরাপত্তার জন্য ?key=YOUR_SECRET না দিলে রান করবে না
   ================================================== */
app.post("/api/items/migrate-seq", async (req, res) => {
  try {
    if (req.query.key !== process.env.MIGRATE_KEY) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // সব ডক কলোেক্ট করে _id টাইম ASC অর্ডার করো
    const all = await Item.find().lean();
    all.sort((a, b) => {
      const ta = a.seq ?? objectIdTime(String(a._id));
      const tb = b.seq ?? objectIdTime(String(b._id));
      return ta - tb;
    });

    // ধারাবাহিক seq বসাও (existing seq থাকলে রাখো)
    let cursor = 1;
    const bulk = Item.collection.initializeUnorderedBulkOp();
    for (const doc of all) {
      const seq = Number.isInteger(doc.seq) ? doc.seq : cursor++;
      bulk.find({ _id: doc._id }).updateOne({ $set: { seq, id: doc.id ?? seq } });
    }
    if (all.length) await bulk.execute();

    res.json({ message: "Migration complete", total: all.length });
  } catch (err) {
    console.error("Migration error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
