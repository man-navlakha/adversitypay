const express = require("express");
const router = express.Router();
const supabase = require("./supabase");
const verifyUser = require("../middleware/verifyUser");

// Get publisher stats
router.get("/stats", verifyUser, async (req, res) => {
  if (req.user.role !== "publisher") return res.status(403).json({ error: "Forbidden" });

  try {
    const { data: earnings } = await supabase
      .from("earnings")
      .select("*")
      .eq("publisher_id", req.user.id)
      .single();

    res.json(earnings || { impressions: 0, clicks: 0, revenue: 0 });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;
