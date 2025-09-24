const supabase = require("../supabase");

async function verifyUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No authorization header" });

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error } = await supabase.auth.getUser(token);

  if (error || !userData.user) return res.status(401).json({ error: "Invalid token" });

  // Fetch profile to get role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) return res.status(403).json({ error: "Profile not found" });

  req.user = {
    id: userData.user.id,
    email: userData.user.email,
    role: profile.role
  };

  next();
}

module.exports = verifyUser;
