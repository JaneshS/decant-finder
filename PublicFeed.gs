/**
 * PUBLIC FEED for the Decant Finder app
 *
 * Add this as a NEW file next to DecantTracker.gs (same Apps Script project). It reuses the
 * tracker's own matching (Aliases, brand clean-up), so the app and your Best Prices tab always
 * agree on which listings are the same perfume. Nothing in DecantTracker.gs needs to change.
 *
 * What it publishes (and nothing else):
 *   seller names and links, brand, perfume, "inspired by", size and price of IN-STOCK listings,
 *   each seller's shipping rules, price drops and perfumes that are new this week.
 * What it never publishes: your email, the Changes log itself, hidden sellers.
 *
 * App settings live in the Sources tab, columns G–L:
 *   G  Show in app (Y/N)            N keeps that seller out of the app (blank = shown)
 *   H  Name in app (optional)       e.g. show "Scent Squad" instead of "Shivansh (Scent Squad)"
 *   I  Free shipping from ₹         e.g. 1500
 *   J  Free shipping from # decants e.g. 4  (if both I and J are set, either one counts)
 *   K  Shipping fee below that ₹    blank = app assumes ₹100; 0 = always free shipping
 *   L  Link in app (optional)       seller's website; blank = the sheet link in column C
 *
 * Setup (once): Deploy → New deployment → type "Web app" → Execute as: Me →
 *   Who has access: Anyone → Deploy. Copy the Web app URL into the app's index.html.
 * Then pick "turnOnFeedRefresh" in the function dropdown and click Run.
 */

const FEED = {
  defaultShippingFee: 100,   // used when a seller's shipping fee is blank
  priceDropDays: 7,          // how far back the "Price drops" list looks
  freshDays: 7,              // how far back the "New" tab looks
  cacheHours: 6,             // the feed is rebuilt at least this often (and every hour by the trigger)
};

// The app calls this web address to get the data.
function doGet() {
  let json;
  try {
    json = getFeedJson_();
  } catch (e) {
    json = JSON.stringify({ error: 'Prices are being updated. Please try again in a minute.' });
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// Rebuilds the feed and stores it in the cache. Runs every hour once turnOnFeedRefresh is set up.
function refreshPublicFeed() {
  const json = JSON.stringify(buildFeed_());
  const cache = CacheService.getScriptCache();
  const size = 20000;                       // each cache entry holds at most 100 KB
  const parts = {};
  let n = 0;
  for (let i = 0; i < json.length; i += size) parts['feed_' + (n++)] = json.slice(i, i + size);
  parts.feed_n = String(n);
  try { cache.putAll(parts, FEED.cacheHours * 3600); } catch (e) { /* still served, just built each time */ }
  return json;
}

// Run this once from the editor: keeps the feed fresh (and fast) by rebuilding it every hour.
function turnOnFeedRefresh() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'refreshPublicFeed')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshPublicFeed').timeBased().everyHours(1).create();
  refreshPublicFeed();
}

// Run this from the editor to check what the app will see (View → Logs / Execution log).
function testFeed() {
  const feed = buildFeed_();
  Logger.log('Sellers in app: ' + feed.sellers.map(s => s.n).join(', '));
  Logger.log('Perfumes: ' + feed.products.length + ', listings: ' +
    feed.products.reduce((n, p) => n + p[4].length, 0) + ', price drops: ' + feed.drops.length +
    ', new this week: ' + feed.fresh.length);
  Logger.log('New this week: ' + feed.fresh.slice(0, 15).map(f => feed.products[f[0]][1] + ' ' + feed.products[f[0]][2] + ' (' + f[1] + ')').join('; '));
  Logger.log('Feed size: ' + Math.round(JSON.stringify(feed).length / 1024) + ' KB');
}

// ===================== BUILDING THE FEED =====================
function getFeedJson_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('feed_n') || 0);
  if (n) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push('feed_' + i);
    const got = cache.getAll(keys);
    if (keys.every(k => got[k] != null)) return keys.map(k => got[k]).join('');
  }
  return refreshPublicFeed();
}

function buildFeed_() {
  const ss = SpreadsheetApp.getActive();
  const settings = readAppSettings_(ss);
  const aliases = readAliasGroups_(ss);
  const allRows = finaliseRows_(readSnapshot_(ss), aliases);
  const rows = allRows.filter(r => !r.oos && r.price > 0 && r.size > 0 && settings[r.seller] && settings[r.seller].show);

  // Sellers, in a fixed order (cheapest lookups in the app refer to them by position)
  const sellerNames = Object.keys(groupBy_(rows, r => r.seller)).sort();
  const sellerIdx = {};
  const sellers = sellerNames.map((name, i) => {
    sellerIdx[name] = i;
    const s = settings[name];
    return { n: s.name || name, ff: s.freeFrom, fc: s.freeCount, fee: s.fee, u: s.link };
  });

  // One entry per perfume (same matching key as Best Prices)
  const byKey = {};
  rows.forEach(r => {
    const p = byKey[r.key] = byKey[r.key] || { key: r.key, names: {}, brands: {}, inspired: {}, offers: [] };
    vote_(p.names, r.nameShown);
    vote_(p.brands, r.brandShown);
    if (r.inspired) vote_(p.inspired, r.inspired);
    p.offers.push([sellerIdx[r.seller], r.size, r.price]);
  });
  const list = Object.keys(byKey).map(k => {
    const p = byKey[k];
    p.offers.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    return [p.key, pick_(p.brands), pick_(p.names), pick_(p.inspired), p.offers];
  }).sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[2]).localeCompare(String(b[2])));
  const productIdx = {};
  list.forEach((p, i) => { productIdx[p[0]] = i; });

  const tz = Session.getScriptTimeZone();
  const changes = readChanges_(ss);
  let checked = new Date();
  try { checked = DriveApp.getFileById(ss.getId()).getLastUpdated(); } catch (e) { /* use now */ }

  return {
    v: 1,
    checked: Utilities.formatDate(checked, tz, 'yyyy-MM-dd'),
    built: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm"),
    defaultFee: FEED.defaultShippingFee,
    dealThreshold: SETTINGS.dealThreshold,
    buckets: SIZE_BUCKETS.map(b => [b.label, b.sizes]),
    sellers: sellers,
    products: list,
    drops: readDrops_(changes, rows, aliases, sellerIdx, productIdx, tz),
    fresh: readFresh_(changes, allRows, aliases, productIdx, tz),
  };
}

// Like the tracker's readAliases_, but every spelling linked through any chain of Aliases rows
// ends up as one perfume, even when rows point both ways ("Zenith Noir" → "Zeneth Noir" and back)
// or in a chain ("Ahmed al maghribhi" → "Ahmad Al maghribhi" → "Ahmed al Maghribi").
// The group's spelling is the one most rows point to; on a tie, the most recently added.
function readAliasGroups_(ss) {
  const out = { brand: {}, name: {} };
  const sh = ss.getSheetByName(TABS.aliases);
  if (!sh || sh.getLastRow() < 2) return out;
  const groups = { brand: [], name: [] };
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach((r, i) => {
    const from = cellText_(r[1]).trim(), to = cellText_(r[2]).trim();
    if (!from || !to) return;
    groups[/brand/i.test(cellText_(r[0])) ? 'brand' : 'name'].push({ from: from, to: to, row: i });
  });
  ['brand', 'name'].forEach(type => {
    const parent = {};
    const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const join = (a, b) => {
      [a, b].forEach(k => { if (parent[k] == null) parent[k] = k; });
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    groups[type].forEach(a => join(compact_(a.from), compact_(a.to)));
    const votes = {};   // group root -> { compact target -> { n, row, text } }
    groups[type].forEach(a => {
      const g = votes[find(compact_(a.from))] = votes[find(compact_(a.from))] || {};
      const t = compact_(a.to);
      const v = g[t] = g[t] || { n: 0, row: -1, text: a.to };
      v.n++;
      if (a.row > v.row) { v.row = a.row; v.text = a.to; }
    });
    const canon = {};
    Object.keys(votes).forEach(root => {
      const best = Object.keys(votes[root]).map(k => votes[root][k]).sort((x, y) => y.n - x.n || y.row - x.row)[0];
      canon[root] = best.text;
    });
    Object.keys(parent).forEach(k => {
      const text = canon[find(k)];
      if (!text) return;
      if (type === 'brand') out.brand[k] = text;
      else out.name[k] = { key: compact_(text), shown: text };
    });
  });
  return out;
}

// Columns G–L of the Sources tab (the tracker itself only reads A–F).
function readAppSettings_(ss) {
  const out = {};
  const sh = ss.getSheetByName(TABS.sources);
  if (!sh || sh.getLastRow() < 2) return out;
  const num = v => { const n = Number(String(v).replace(/[^\d.]/g, '')); return n > 0 ? n : 0; };
  sh.getRange(2, 1, sh.getLastRow() - 1, 12).getDisplayValues().forEach(r => {
    const seller = String(r[0]).trim();
    if (!seller || /^n/i.test(String(r[5]).trim())) return;
    const fee = String(r[10]).trim();
    out[seller] = {
      show: !/^n/i.test(String(r[6]).trim()),
      name: String(r[7]).trim(),
      freeFrom: num(r[8]),
      freeCount: num(r[9]),
      fee: fee === '' ? null : num(fee),
      link: sellerLink_(String(r[11]).trim(), String(r[2]).trim(), String(r[1]).trim()),
    };
  });
  return out;
}

// Column L if filled in, else the sheet link from column C (a JSON price list links to its site).
function sellerLink_(own, source, type) {
  const ok = u => /^https:\/\/[^\s"<>]+$/.test(u) ? u : '';
  if (own) return ok(own);
  if (!/^https:\/\//.test(source)) return '';
  const sheet = source.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheet) return 'https://docs.google.com/spreadsheets/d/' + sheet[1] + '/edit';
  if (/^json$/i.test(type)) return ok(source.replace(/[^\/]*$/, ''));
  return ok(source);
}

// The Changes tab (most recent rows), read once and shared by price drops and new perfumes.
function readChanges_(ss) {
  const sh = ss.getSheetByName(TABS.changes);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow(), first = Math.max(2, last - 7999);
  return sh.getRange(first, 1, last - first + 1, 8).getValues().map(v => {
    const when = v[0] instanceof Date ? v[0] : new Date(v[0]);
    return { t: when.getTime(), when: when, seller: cellText_(v[1]), change: cellText_(v[2]),
      brand: cellText_(v[3]), name: cellText_(v[4]), size: Number(v[5]), was: v[6], now: v[7] };
  }).filter(c => c.seller && c.name && !isNaN(c.t));
}

// The matching key the app uses for one seller's brand + perfume name (cached).
function keyOf_(cache, aliases, seller, brand, name) {
  const id = seller + '\u0001' + brand + '\u0001' + name;
  if (!(id in cache)) cache[id] = finaliseRows_([makeRow_(seller, brand, name, 1, 1, false, '', '')], aliases)[0].key;
  return cache[id];
}

// Price drops from the Changes tab that are still the current, in-stock price.
function readDrops_(changes, rows, aliases, sellerIdx, productIdx, tz) {
  const since = Date.now() - FEED.priceDropDays * 86400000;
  const current = {}, keys = {};
  rows.forEach(r => { current[[r.seller, r.key, r.size].join('|')] = r; });
  const out = [], seen = {};
  for (let i = changes.length - 1; i >= 0; i--) {          // newest first
    const c = changes[i];
    if (c.change !== 'Price' || c.t < since) continue;
    const was = Number(c.was), now = Number(String(c.now).replace(/[^\d.]/g, ''));
    if (!(was > 0 && now > 0 && now < was)) continue;
    const r = current[[c.seller, keyOf_(keys, aliases, c.seller, c.brand, c.name), c.size].join('|')];
    if (!r || r.price !== now || productIdx[r.key] == null) continue;
    const id = r.seller + '|' + r.key + '|' + r.size;
    if (seen[id]) continue;
    seen[id] = true;
    out.push([productIdx[r.key], sellerIdx[r.seller], r.size, was, now, Utilities.formatDate(c.when, tz, 'yyyy-MM-dd')]);
  }
  return out;
}

// Perfumes that are new to the tracker this week: every seller that lists one today added it in the
// last FEED.freshDays days, nothing about it appears in the log before that, and it wasn't just a
// listing removed and re-added under the same name (sellers often rename rows).
// Returns [product index, first seen (yyyy-MM-dd)], newest first.
function readFresh_(changes, allRows, aliases, productIdx, tz) {
  const start = Date.now() - FEED.freshDays * 86400000;
  const keys = {}, ev = {};
  changes.forEach(c => {
    const k = keyOf_(keys, aliases, c.seller, c.brand, c.name);
    const e = ev[k] = ev[k] || { before: false, added: {}, gone: [] };
    if (c.t < start) { e.before = true; return; }
    if (c.change === 'New') e.added[c.seller] = Math.min(e.added[c.seller] || Infinity, c.t);
    else if (c.change === 'Gone') e.gone.push(c.t);
  });
  const sellersOf = {};
  allRows.forEach(r => { (sellersOf[r.key] = sellersOf[r.key] || {})[r.seller] = true; });
  const out = [];
  Object.keys(productIdx).forEach(k => {
    const e = ev[k];
    if (!e || e.before) return;
    const sellers = Object.keys(sellersOf[k] || {});
    if (!sellers.length || !sellers.every(s => e.added[s] != null)) return;
    const first = Math.min.apply(null, sellers.map(s => e.added[s]));
    if (e.gone.some(t => t <= first + 86400000)) return;
    out.push([productIdx[k], first]);
  });
  return out.sort((a, b) => b[1] - a[1]).map(f => [f[0], Utilities.formatDate(new Date(f[1]), tz, 'yyyy-MM-dd')]);
}

// Picks the most common spelling, preferring "Zenith Santal" over "ZENITH SANTAL".
function vote_(bag, text) {
  text = clean_(text);
  if (!text) return;
  const k = text.toLowerCase();
  const v = bag[k] = bag[k] || { n: 0, forms: {} };
  v.n++;
  v.forms[text] = (v.forms[text] || 0) + 1;
}

function pick_(bag) {
  const best = Object.keys(bag).sort((a, b) => bag[b].n - bag[a].n || a.length - b.length)[0];
  if (!best) return '';
  const forms = bag[best].forms;
  const all = Object.keys(forms).sort((a, b) => forms[b] - forms[a]);
  const mixed = all.filter(f => f !== f.toUpperCase() && f !== f.toLowerCase());
  if (mixed.length) return mixed[0];
  const caps = all.filter(f => f === f.toUpperCase());
  return caps.length ? softenCaps_(caps[0]) : all[0];
}

// "ZENITH SANTAL" -> "Zenith Santal"; short words like "YSL", "EDP", "9PM" stay as they are.
function softenCaps_(s) {
  return s.split(' ').map(w => /^[A-Z]{4,}$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w).join(' ');
}
