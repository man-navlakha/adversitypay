const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const verifyUser = require("../middleware/verifyUser");

// Advertiser creates ad
router.post("/create", verifyUser, async (req, res) => {
  if (req.user.role !== "advertiser") return res.status(403).json({ error: "Forbidden" });

  const { title, image, click_url, budget, cpc } = req.body;
  try {
    const { data, error } = await supabase.from("ads").insert([
      {
        advertiser_id: req.user.id,
        title,
        image,
        click_url,
        budget,
        cpc
      }
    ]);

    if (error) throw error;
    res.json({ success: true, ad: data[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to create ad" });
  }
});

// Serve random ad for a publisher
router.get("/serve", async (req, res) => {
  const { pub_id } = req.query;

  try {
    // pick random active ad
    const { data: ads } = await supabase
      .from("ads")
      .select("*")
      .eq("status", "active");

    if (!ads || ads.length === 0) return res.json({});

    const ad = ads[Math.floor(Math.random() * ads.length)];

    // log impression
    await supabase.from("impressions").insert([{ ad_id: ad.id, publisher_id: pub_id }]);

    // update publisher earnings: each impression could have 0.01 revenue for example
    const impressionRevenue = 0.01;

    // upsert earnings row
    await supabase.from("earnings").upsert(
      { publisher_id: pub_id, impressions: 1, revenue: impressionRevenue },
      { onConflict: "publisher_id", merge: true }
    ).eq("publisher_id", pub_id);

    // optionally deduct from advertiser budget
    await supabase.rpc('decrease_ad_budget', { ad_id_param: ad.id, amount_param: impressionRevenue });

    res.json({
      id: ad.id,
      title: ad.title,
      image: ad.image,
      clickUrl: `${process.env.API_URL}/api/ads/click?ad_id=${ad.id}&pub_id=${pub_id}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to serve ad" });
  }
});


// Track click
router.get("/click", async (req, res) => {
  const { ad_id, pub_id } = req.query;

  try {
    await supabase.from("clicks").insert([{ ad_id, publisher_id: pub_id }]);

    // define CPC (cost per click) from ad
    const { data: adData } = await supabase
      .from("ads")
      .select("cpc")
      .eq("id", ad_id)
      .single();

    const cpc = parseFloat(adData.cpc || 0);

    // update publisher earnings
    await supabase.from("earnings").upsert(
      { publisher_id: pub_id, clicks: 1, revenue: cpc },
      { onConflict: "publisher_id", merge: true }
    );

    // optionally deduct from advertiser budget
    await supabase.rpc('decrease_ad_budget', { ad_id_param: ad_id, amount_param: cpc });

    // redirect user to ad landing page
    const { data: ad } = await supabase
      .from("ads")
      .select("click_url")
      .eq("id", ad_id)
      .single();

    res.redirect(ad.click_url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to track click" });
  }
});


module.exports = router;
