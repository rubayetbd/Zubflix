/*
 * MovieLinkBD Provider for Nuvio
 * ========================================
 * Adapted from reference architecture for MovieLinkBD.io
 * Supports Movies + TV with direct/r2/cloud streams
 */

var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "movielinkbd";
var DEFAULT_MAIN_URL = "https://movielinkbd.io";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var DEBUG = false;

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive"
};

var cachedActiveMainUrl = null;
var activeMainUrlTs = 0;
var ACTIVE_URL_CACHE_TTL = 30 * 60 * 1000;

function dbg() {
  if (!DEBUG) return;
  console.log.apply(console, arguments);
}

function assign(target, source) {
  var out = {};
  var k;
  target = target || {};
  source = source || {};
  for (k in target) out[k] = target[k];
  for (k in source) out[k] = source[k];
  return out;
}

function fetchText(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: assign(DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    if (!res.ok && res.status !== 301 && res.status !== 302) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }
    return res.text();
  });
}

function fetchResponse(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: assign(DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  });
}

function fixUrl(url, baseUrl) {
  if (!url) return "";
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  try {
    return new URL(url, baseUrl).toString();
  } catch(e) {
    return url;
  }
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function levenshteinDistance(s, t) {
  if (s === t) return 0;
  var n = s.length, m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  var d = [];
  var i, j, cost;
  for (i = 0; i <= n; i += 1) { d[i] = []; d[i][0] = i; }
  for (j = 0; j <= m; j += 1) d[0][j] = j;
  for (i = 1; i <= n; i += 1) {
    for (j = 1; j <= m; j += 1) {
      cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost);
    }
  }
  return d[n][m];
}

function detectQualityFromSources(parts) {
  var sources = Array.isArray(parts) ? parts : [parts];
  var i, text, m;
  for (i = 0; i < sources.length; i += 1) {
    text = String(sources[i] || "").toLowerCase();
    m = text.match(/\b(2160p|1440p|1080p|720p|480p)\b/);
    if (m) return m[1];
    if (/\b4k\b|\buhd\b/.test(text)) return "2160p";
  }
  return "Auto";
}

function inferLang(text) {
  var t = String(text || "").toLowerCase();
  var langs = [];
  if (t.indexOf("hindi") !== -1) langs.push("Hindi");
  if (t.indexOf("english") !== -1 || /\beng\b/.test(t)) langs.push("English");
  // Add more as needed from site
  if (langs.length > 1) return langs.join("-");
  if (langs.length === 1) return langs[0];
  return "EN";
}

function cleanLabelText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStream(label, finalUrl, finalQuality, streamHeaders, size, tech, langHint, meta) {
  var ui = buildMeta(meta, label, finalQuality, size, tech, langHint);
  return {
    name: ui.name,
    title: ui.title,
    url: finalUrl,
    quality: finalQuality,
    headers: Object.keys(streamHeaders || {}).length ? streamHeaders : undefined,
    behaviorHints: { 
      bingeGroup: "movielinkbd-" + String(finalQuality || "auto").toLowerCase() 
    }
  };
}

function buildMeta(meta, label, quality, size, tech, langHint) {
  var cleanedLabel = cleanLabelText(label);
  var lang = inferLang((langHint || "") + " " + cleanedLabel);
  var isSeries = !!(meta && (meta.season || meta.episode));
  var displayTitle = (meta && meta.title) ? meta.title : (isSeries ? "Series" : "Movie");
  var year = (meta && meta.year) ? " - " + meta.year : "";
  var line1 = isSeries 
    ? "📺 S" + meta.season + "E" + meta.episode + (meta.episodeTitle ? " - " + meta.episodeTitle : "") + " | " + displayTitle + year
    : "🎬 " + displayTitle + year;
  var qIcon = (quality.indexOf('2160') !== -1 || quality.indexOf('4K') !== -1) ? '💎' : '📺';
  var line2 = qIcon + " " + quality + " | 🌍 " + lang + (size ? " | 💾 " + size : "");
  var line3 = "🎞️ MKV | ℹ️ " + (tech || "WEB-DL");
  return {
    name: "MovieLinkBD | " + quality,
    title: line1 + "\n" + line2 + "\n" + line3
  };
}

function uniqueBy(list, keyFn) {
  var seen = {};
  var out = [];
  var i, key;
  for (i = 0; i < list.length; i += 1) {
    key = keyFn(list[i]);
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(list[i]);
  }
  return out;
}

function dedupeStreams(streams) {
  return uniqueBy(streams, function(s) {
    var urlKey = String(s.url || "").slice(0, 80).replace(/[^a-z0-9]/g, "");
    return urlKey;
  });
}

function isPlayableMediaUrl(url) {
  var u = String(url || "").toLowerCase();
  return /\.(mkv|mp4|m3u8)(\?|#|$)/.test(u) ||
         u.indexOf(".r2.dev/") !== -1 ||
         u.indexOf("cloudflarestorage.com") !== -1 ||
         u.indexOf("instantcloud.org") !== -1;
}

function getMainUrl() {
  var now = Date.now();
  if (cachedActiveMainUrl && now - activeMainUrlTs < ACTIVE_URL_CACHE_TTL) {
    return Promise.resolve(cachedActiveMainUrl);
  }
  return fetchResponse(DEFAULT_MAIN_URL, { redirect: "follow" }).then(function(res) {
    var final = res.url || DEFAULT_MAIN_URL;
    cachedActiveMainUrl = final.replace(/\/$/, "");
    activeMainUrlTs = now;
    dbg("[getMainUrl] Active:", cachedActiveMainUrl);
    return cachedActiveMainUrl;
  }).catch(function() {
    cachedActiveMainUrl = DEFAULT_MAIN_URL;
    activeMainUrlTs = now;
    return DEFAULT_MAIN_URL;
  });
}

function getTmdbNames(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetchText(url).then(function(data) {
    var json = JSON.parse(data);
    var title = json.name || json.title || "";
    var year = (json.release_date || json.first_air_date || "").split("-")[0];
    return { title: title, year: year };
  }).catch(function() {
    return { title: "", year: "" };
  });
}

function getTmdbEpisodeName(tmdbId, season, episode) {
  if (!season || !episode) return Promise.resolve("");
  var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "/episode/" + episode + "?api_key=" + TMDB_API_KEY;
  return fetchText(url).then(function(data) {
    var json = JSON.parse(data);
    return json.name || "";
  }).catch(function() { return ""; });
}

function searchContent(query, mediaType, year) {
  return getMainUrl().then(function(mainUrl) {
    var searchQuery = query + (year ? " " + year : "");
    var searchUrl = mainUrl + "/?search=" + encodeURIComponent(searchQuery);
    dbg("[searchContent] URL:", searchUrl);
    return fetchText(searchUrl).then(function(html) {
      var $ = cheerio.load(html);
      var results = [];
      var selectors = [
        "div.movie-item a[href*='/movie/'], div.movie-item a[href*='/series/']",
        "a[href*='/movie/'], a[href*='/series/']",
        ".movie-card a, .film-item a, .post-item a"
      ].join(", ");

      $(selectors).each(function(_, el) {
        var href = fixUrl($(el).attr("href"), mainUrl);
        if (!href || !/\/(movie|series)\//.test(href)) return;
        var title = $(el).find(".title, h2, h3, .movie-title").first().text().trim() || $(el).attr("title") || $(el).text().trim();
        if (!title || title.length < 3) return;

        var isSeries = /\/series\//.test(href);
        if (mediaType === "movie" && isSeries) return;
        if (mediaType === "tv" && !isSeries) return;

        var distance = levenshteinDistance(normalizeTitle(title), normalizeTitle(query));
        results.push({ href: href, title: title, distance: distance });
      });

      if (!results.length) return null;
      results.sort(function(a, b) { return a.distance - b.distance; });
      dbg("[searchContent] Best:", results[0].title);
      return results[0].href;
    });
  });
}

function collectLinks($, pageUrl) {
  var links = [];
  // Primary: getLink / getWatch
  $("a[href*='/getLink/'], a[href*='/getWatch/'], a[href*='/file/']").each(function(_, el) {
    var href = fixUrl($(el).attr("href"), pageUrl);
    var label = cleanLabelText($(el).text().trim());
    if (href) links.push({ url: href, label: label });
  });
  return uniqueBy(links, function(l) { return l.url; });
}

function resolveGetWatch(url, label, quality, meta) {
  return fetchText(url).then(function(html) {
    var $ = cheerio.load(html);
    var videoSrc = $("video source, video[src]").first().attr("src") || $("iframe[src]").first().attr("src");
    if (videoSrc) {
      var full = fixUrl(videoSrc, url);
      if (isPlayableMediaUrl(full)) {
        return [buildStream(label + " Watch", full, quality, { Referer: url }, "", "", "", meta)];
      }
    }
    return [];
  }).catch(function() { return []; });
}

function resolveGetLinkOrFile(url, label, quality, meta) {
  return fetchText(url).then(function(html) {
    var $ = cheerio.load(html);
    var candidates = [];
    $("a[href]").each(function(_, el) {
      var href = fixUrl($(el).attr("href"), url);
      if (isPlayableMediaUrl(href) || href.includes("/open/")) {
        candidates.push(href);
      }
    });
    if (candidates.length) {
      return [buildStream(label, candidates[0], quality, { Referer: url }, "", "", "", meta)];
    }
    // Fallback direct
    return isPlayableMediaUrl(url) ? [buildStream(label, url, quality, { Referer: url }, "", "", "", meta)] : [];
  }).catch(function() { return []; });
}

function resolveLink(rawUrl, label, referer, quality, meta) {
  if (!rawUrl) return Promise.resolve([]);
  var lower = rawUrl.toLowerCase();
  if (lower.includes("/getwatch/")) {
    return resolveGetWatch(rawUrl, label, quality, meta);
  }
  return resolveGetLinkOrFile(rawUrl, label, quality, meta);
}

function extractFromPage(contentUrl, mediaType, season, episode, meta) {
  return fetchText(contentUrl).then(function(html) {
    var $ = cheerio.load(html);
    var links = collectLinks($, contentUrl);
    dbg("[extractFromPage] Found", links.length, "links");

    return Promise.all(links.map(function(item) {
      var quality = detectQualityFromSources([item.label, item.url]);
      return resolveLink(item.url, item.label, contentUrl, quality, meta).catch(function() { return []; });
    })).then(function(groups) {
      var streams = groups.flat();
      streams = dedupeStreams(streams);
      dbg("[extractFromPage] Final streams:", streams.length);
      return streams;
    });
  }).catch(function(e) {
    dbg("[extractFromPage] ERROR:", e.message);
    return [];
  });
}

function findContentUrl(tmdbId, mediaType) {
  return getTmdbNames(tmdbId, mediaType).then(function(names) {
    if (!names.title) return null;
    return searchContent(names.title, mediaType, names.year).then(function(found) {
      if (found) return found;
      return null;
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return getTmdbNames(tmdbId, mediaType).then(function(tmdbData) {
    var epPromise = mediaType === "tv" ? getTmdbEpisodeName(tmdbId, season, episode) : Promise.resolve("");
    return epPromise.then(function(epTitle) {
      return findContentUrl(tmdbId, mediaType).then(function(contentUrl) {
        if (!contentUrl) return [];
        var meta = {
          title: tmdbData.title || "Movie",
          year: tmdbData.year || "",
          season: season,
          episode: episode,
          episodeTitle: epTitle
        };
        return extractFromPage(contentUrl, mediaType, season, episode, meta);
      });
    });
  }).catch(function(e) {
    dbg("[getStreams] Top level error:", e.message);
    return [];
  });
}

module.exports = { getStreams: getStreams };
