const supabase = require("./supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const pub_id = req.query.pub_id;
  if (!pub_id) return res.status(400).json({ error: "Publisher ID is required" });

  try {
    const { data: stats, error } = await supabase.from("earnings").select("*").eq("publisher_id", pub_id).single();
    if (error) throw error;

    res.json(stats || { impressions: 0, clicks: 0, revenue: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
