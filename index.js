// index.js
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
app.use(helmet());
app.use(cors()); // restrict this in production
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// ---------- publisher script (the one publishers include) ----------
app.get('/publisher.js', (req, res) => {
  res.type('application/javascript');
  res.send(`(function(){
    var script = document.currentScript || (function(){var s=document.getElementsByTagName('script'); return s[s.length-1];})();
    var slot = script && script.getAttribute('data-slot');
    if (!slot) return;
    var iframe = document.createElement('iframe');
    iframe.width = script.getAttribute('data-width') || '300';
    iframe.height = script.getAttribute('data-height') || '250';
    iframe.style.border = '0';
    iframe.style.overflow = 'hidden';
    iframe.scrolling = 'no';
    // sandbox to isolate ad content; allow-popups if you rely on target=_blank
    iframe.setAttribute('sandbox','allow-forms allow-popups allow-scripts');
    iframe.src = "${BASE}/ad/render?slot=" + encodeURIComponent(slot) + "&_=" + Date.now();
    script.parentNode.insertBefore(iframe, script);
  })();`);
});

// ---------- ad render: picks an ad and serves an HTML document for iframe ----------
app.get('/ad/render', async (req, res) => {
  const slotKey = req.query.slot;
  if (!slotKey) return res.status(400).send('Missing slot');

  // 1) lookup slot
  const { data: slotRow, error: slotErr } = await supabase
    .from('ad_slots')
    .select('*')
    .eq('slot_key', slotKey)
    .maybeSingle();

  if (slotErr || !slotRow) {
    return res.status(404).send('Slot not found');
  }

  // 2) find active campaign with remaining budget, highest CPM
  // Simplest selection: fetch active campaigns and their creatives, choose highest cpm
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*, creatives(*)')
    .eq('status', 'active')
    .gt('budget', 'budget_spent')
    .order('cpm', { ascending: false });

  if (!campaigns || campaigns.length === 0) {
    // fallback: show empty safe creative
    return res.send(`<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif">
      <div style="width:${slotRow.width}px;height:${slotRow.height}px;display:flex;align-items:center;justify-content:center;background:#f8f8f8;color:#666">
        No ads right now
      </div></body></html>`);
  }

  // pick top campaign, then a creative from it
  const campaign = campaigns[0];
  const creative = (campaign.creatives && campaign.creatives[0]);
  if (!creative) {
    return res.status(404).send('No creative available');
  }

  // 3) build impression pixel and click URL
  const impressionUrl = `${BASE}/track/impression?creative_id=${creative.id}&slot_id=${slotRow.id}&_=${Date.now()}`;
  const clickUrl = `${BASE}/track/click?creative_id=${creative.id}&slot_id=${slotRow.id}`;

  // 4) return the HTML for iframe (simple image creative)
  const html = `<!doctype html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;padding:0}img{display:block;border:0}</style>
  </head>
  <body>
    <a href="${clickUrl}" target="_top" rel="noopener noreferrer">
      <img src="${creative.image_url}" width="${creative.width || slotRow.width}" height="${creative.height || slotRow.height}" alt="Sponsored ad">
    </a>
    <img src="${impressionUrl}" width="1" height="1" style="display:none" alt="">
  </body>
  </html>`;

  res.type('text/html').send(html);
});

// ---------- impression pixel ----------
const tinyGif = Buffer.from(
  // 1x1 transparent GIF base64
  'R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

app.get('/track/impression', async (req, res) => {
  const creative_id = req.query.creative_id;
  const slot_id = req.query.slot_id;
  try {
    await supabase.from('impressions').insert([{
      creative_id,
      slot_id,
      ip: req.ip,
      user_agent: req.get('User-Agent')
    }]);
  } catch (e) {
    console.error('impression log error', e);
  }
  res.set('Content-Type', 'image/gif');
  res.send(tinyGif);
});

// ---------- click tracking -> log & redirect ----------
app.get('/track/click', async (req, res) => {
  const creative_id = req.query.creative_id;
  const slot_id = req.query.slot_id;
  // find creative to get click_url
  const { data: creative } = await supabase.from('creatives').select('click_url').eq('id', creative_id).maybeSingle();
  if (!creative || !creative.click_url) {
    return res.status(404).send('Click URL not found');
  }
  try {
    await supabase.from('clicks').insert([{
      creative_id,
      slot_id,
      ip: req.ip,
      user_agent: req.get('User-Agent')
    }]);
  } catch (e) { console.error('click log error', e); }
  // redirect to advertiser landing page
  res.redirect(302, creative.click_url);
});

// ---------- start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Ad server running on', PORT));
