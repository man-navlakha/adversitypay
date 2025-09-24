const supabase = require("./supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const pub_id = req.query.pub_id;
  if (!pub_id) return res.status(400).json({ error: "Publisher ID is required" });

  try {
    const { data: ads, error } = await supabase.from("ads").select("*").eq("status", "active");
    if (error) throw error;

    if (!ads || ads.length === 0) return res.json({});

    const ad = ads[Math.floor(Math.random() * ads.length)];

    // log impression
    await supabase.from("impressions").insert([{ ad_id: ad.id, publisher_id: pub_id }]);

    res.json({
      id: ad.id,
      title: ad.title,
      image: ad.image,
      clickUrl: `/api/clicks?ad_id=${ad.id}&pub_id=${pub_id}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
