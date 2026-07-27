/**
 * MovieBox Scraper for Nuvio Provider.
 * Direct port of Kotlin MovieBoxWebSource implementation.
 */

'use strict';

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TAG = '[MovieBox]';

let bearerToken = null;

function cleanTitle(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function titlesMatch(t1, t2) {
  if (!t1 || !t2) return false;
  const c1 = cleanTitle(t1);
  const c2 = cleanTitle(t2);
  return c1 === c2 || c1.includes(c2) || c2.includes(c1);
}

async function getTMDBDetails(tmdbId, mediaType) {
  const type = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("TMDB HTTP " + res.status);
    const data = await res.json();
    const title = type === 'tv' ? data.name : data.title;
    const releaseDate = type === 'tv' ? data.first_air_date : data.release_date;
    return {
      title: title || "",
      year: releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null,
      imdbId: data.external_ids?.imdb_id || null
    };
  } catch (err) {
    console.error(TAG, "TMDB details failed:", err.message);
    return null;
  }
}

async function getBearerToken() {
  if (bearerToken) return bearerToken;

  try {
    const url = "https://h5-api.aoneroom.com/wefeed-h5api-bff/home?host=moviebox.ph";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Referer": "https://moviebox.ph/",
        "Origin": "https://moviebox.ph",
        "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
        "X-Request-Lang": "en",
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    const xUser = res.headers.get("x-user");
    if (xUser) {
      try {
        const json = JSON.parse(xUser);
        if (json.token) bearerToken = json.token;
      } catch (e) {}
    }

    if (!bearerToken) {
      const setCookie = res.headers.get("set-cookie") || "";
      const match = setCookie.match(/token=([^;]+)/);
      if (match) bearerToken = match[1];
    }

    if (!bearerToken) {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          const tok = json.data?.user?.token || json.data?.token || json.user?.token;
          if (tok) bearerToken = tok;
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error(TAG, "Error fetching bearer token:", e.message);
  }

  return bearerToken;
}

async function getHeaders(extraHeaders = {}) {
  const token = await getBearerToken();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Referer": "https://moviebox.ph/",
    "Origin": "https://moviebox.ph",
    "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
    "X-Request-Lang": "en",
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...extraHeaders
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function searchMovieBox(query) {
  if (!query || !query.trim()) return [];
  const headers = await getHeaders();
  const url = "https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        keyword: query.trim(),
        page: 1,
        perPage: 20
      })
    });

    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim().startsWith("{")) return [];
    const json = JSON.parse(text);
    const dataObj = json.data || {};
    const rawItems = dataObj.items || dataObj.list || [];

    const items = [];
    for (const item of rawItems) {
      const sub = item.subject || item;
      const title = sub.title;
      if (!title || !title.trim()) continue;

      const subjectId = String(sub.subjectId || "");
      const detailPath = String(sub.detailPath || "");
      const isSeries = sub.subjectType === 2;
      const releaseDate = sub.releaseDate || "";
      const year = parseInt(String(releaseDate).slice(0, 4), 10) || null;

      if (subjectId || detailPath) {
        items.push({
          subjectId,
          detailPath,
          title,
          isSeries,
          year
        });
      }
    }
    return items;
  } catch (e) {
    console.error(TAG, "Search error:", e.message);
    return [];
  }
}

async function getDetails(subjectId, detailPath) {
  const headers = await getHeaders();
  const candidates = [];
  if (detailPath) {
    candidates.push(`https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(detailPath)}`);
  }
  if (subjectId && subjectId !== detailPath) {
    candidates.push(`https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(subjectId)}`);
  }
  if (subjectId) {
    candidates.push(`https://api3.aoneroom.com/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`);
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const json = await res.json();
      const dataObj = json.data;
      if (!dataObj) continue;

      const subject = dataObj.subject || (dataObj.title || dataObj.subjectId ? dataObj : null);
      if (!subject) continue;

      const realSubjectId = String(subject.subjectId || subjectId || "");
      const realDetailPath = String(subject.detailPath || detailPath || "");

      return {
        subjectId: realSubjectId,
        detailPath: realDetailPath,
        title: subject.title || "",
        isSeries: subject.subjectType === 2 || subject.subjectType === 7
      };
    } catch (e) {
      // try next
    }
  }
  return null;
}

async function getMovieBoxBaseUrl() {
  const configEndpoints = ["https://themoviebox.org", "https://m2box.org"];
  for (const endpoint of configEndpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" }
      });
      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith("{")) {
          const json = JSON.parse(text);
          const urlObj = json.movieBoxWeb;
          const url = urlObj?.url?.trim()?.replace(/\/$/, "");
          if (url) {
            return url.startsWith("http") ? url : "https://" + url;
          }
        }
      }
    } catch (e) {}
  }
  return "https://m2box.org";
}

function parseQuality(resolutions) {
  if (!resolutions) return null;
  const values = String(resolutions)
    .split(",")
    .map(v => parseInt(v.trim(), 10))
    .filter(v => [360, 480, 720, 1080, 2160].includes(v));
  if (values.length === 0) return null;
  const maxVal = Math.max(...values);
  return `${maxVal}p`;
}

function parseStreamType(format) {
  const f = String(format || "").toUpperCase();
  if (f === "HLS" || f === "M3U8") return "m3u8";
  if (f === "DASH") return "mpd";
  return "mp4";
}

async function getCaptions(baseUrl, subjectId, detailPath, streamId, streamFormat, referer) {
  if (!streamId || !streamFormat) return "";
  try {
    const encodedPath = encodeURIComponent(detailPath);
    const encodedId = encodeURIComponent(subjectId);
    const encodedFormat = encodeURIComponent(streamFormat);
    const capStreamId = encodeURIComponent(streamId);
    const capUrl = `${baseUrl}/wefeed-h5api-bff/subject/caption?format=${encodedFormat}&id=${capStreamId}&subjectId=${encodedId}&detailPath=${encodedPath}`;

    const headers = await getHeaders({
      "Referer": referer,
      "X-Client-Info": JSON.stringify({ timezone: "Asia/Colombo" }),
      "X-Source": ""
    });

    const res = await fetch(capUrl, { headers });
    if (!res.ok) return "";
    const json = await res.json();
    const captions = json.data?.captions || [];

    let selectedUrl = "";
    for (const cap of captions) {
      const url = cap.url;
      const lan = cap.lan || cap.lanName || "";
      if (url) {
        if (/en/i.test(lan) || !selectedUrl) {
          selectedUrl = url;
          if (/en/i.test(lan)) break;
        }
      }
    }
    return selectedUrl;
  } catch (e) {
    return "";
  }
}

async function extractVideoLinks(subjectId, detailPath, season, episode, mediaTitle) {
  const dynamicBaseUrl = await getMovieBoxBaseUrl();
  const baseUrls = Array.from(new Set([
    dynamicBaseUrl,
    "https://m2box.org",
    "https://netfilm.world",
    "https://moviebox.ph",
    "https://h5-api.aoneroom.com"
  ]));

  const cleanDetailPath = detailPath.replace(/^\/+/, "").replace(/^movies?\//, "");
  const detailPathCandidates = Array.from(new Set([cleanDetailPath, detailPath, subjectId])).filter(Boolean);

  const seEpCandidates = (season && episode && season > 0 && episode > 0)
    ? [{ s: season, e: episode }, { s: null, e: null }]
    : [{ s: null, e: null }];

  const streamResults = [];

  for (const baseUrl of baseUrls) {
    for (const candPath of detailPathCandidates) {
      for (const seEp of seEpCandidates) {
        const s = seEp.s;
        const e = seEp.e;

        const watchParams = new URLSearchParams({
          id: subjectId,
          type: "/movie/detail",
          detailSe: (s && s > 0) ? String(s) : "",
          detailEp: (e && e > 0) ? String(e) : "",
          lang: "en"
        }).toString();

        const referer = `${baseUrl}/movies/${candPath}?${watchParams}`;

        const playParamsObj = { subjectId: subjectId, detailPath: candPath };
        if (s && e && s > 0 && e > 0) {
          playParamsObj.se = String(s);
          playParamsObj.ep = String(e);
        }
        const playParams = new URLSearchParams(playParamsObj).toString();
        const playUrl = `${baseUrl}/wefeed-h5api-bff/subject/play?${playParams}`;

        try {
          const reqHeaders = await getHeaders({
            "Referer": referer,
            "X-Client-Info": JSON.stringify({ timezone: "Asia/Colombo" }),
            "X-Source": ""
          });

          const res = await fetch(playUrl, { headers: reqHeaders });
          if (!res.ok) continue;
          const text = await res.text();
          if (!text.trim().startsWith("{")) continue;

          const json = JSON.parse(text);
          const code = json.code;
          const playData = json.data;

          if (code !== 0 || !playData || !playData.hasResource) continue;

          const availableSources = [];
          ["streams", "hls", "dash"].forEach(key => {
            const arr = playData[key];
            if (Array.isArray(arr)) {
              arr.forEach(obj => {
                if (obj && obj.url && !obj.vipLocked) {
                  availableSources.push(obj);
                }
              });
            }
          });

          if (availableSources.length === 0) continue;

          for (let i = 0; i < availableSources.length; i++) {
            const source = availableSources[i];
            const rawUrl = source.url;
            const streamId = source.id || "";
            const format = source.format || "";
            const resolutions = source.resolutions || "";
            const quality = parseQuality(resolutions) || source.quality || "HD";
            const streamType = parseStreamType(format);

            const subUrl = await getCaptions(baseUrl, subjectId, candPath, streamId, format, referer);

            const displayQuality = (quality.endsWith("p") || quality === "HD" || quality === "4K") ? quality : `${quality}p`;

            const playerHeaders = {
              "Referer": baseUrl.endsWith("/") ? baseUrl : baseUrl + "/",
              "Origin": baseUrl,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            };

            const streamTitleLines = [
              `🎬 ${mediaTitle}`,
              `⭐ Quality: ${displayQuality} (${streamType.toUpperCase()})`,
              `📺 Server ${i + 1} | MovieBox Direct API`
            ];

            const subtitlesList = subUrl ? [{ url: subUrl, lang: "English" }] : [];

            streamResults.push({
              name: `MovieBox | ${displayQuality} | Server ${i + 1}`,
              title: streamTitleLines.join("\n"),
              url: rawUrl,
              quality: displayQuality,
              headers: playerHeaders,
              behaviorHints: {
                bingeGroup: "moviebox",
                notWebReady: false
              },
              subtitles: subtitlesList
            });
          }

          if (streamResults.length > 0) return streamResults;
        } catch (err) {
          // try next candidate
        }
      }
    }
  }

  return streamResults;
}

async function scrape(meta) {
  const title = meta && meta.title;
  const type = (meta && meta.type) || "movie";
  const season = meta && meta.season;
  const episode = meta && meta.episode;
  const year = meta && meta.year;

  if (!title || !title.trim()) return [];

  try {
    const searchCandidates = await searchMovieBox(title);
    if (!searchCandidates || searchCandidates.length === 0) return [];

    const isTargetSeries = type === "series" || type === "tv";
    let matchedCandidates = searchCandidates.filter(candidate => {
      const titleMatches = titlesMatch(candidate.title, title);
      const typeMatches = isTargetSeries ? candidate.isSeries : !candidate.isSeries;
      const yearMatches = (year != null && candidate.year != null)
        ? Math.abs(year - candidate.year) <= 1
        : true;
      return titleMatches && typeMatches && yearMatches;
    });

    if (matchedCandidates.length === 0) {
      matchedCandidates = searchCandidates.filter(c => titlesMatch(c.title, title));
    }

    if (matchedCandidates.length === 0 && searchCandidates.length > 0) {
      matchedCandidates = [searchCandidates[0]];
    }

    const results = [];
    for (const candidate of matchedCandidates.slice(0, 2)) {
      let subId = candidate.subjectId;
      let detPath = candidate.detailPath;

      const details = await getDetails(subId, detPath);
      if (details) {
        if (details.subjectId) subId = details.subjectId;
        if (details.detailPath) detPath = details.detailPath;
      }

      const streams = await extractVideoLinks(
        subId,
        detPath,
        isTargetSeries ? season : null,
        isTargetSeries ? episode : null,
        candidate.title
      );
      results.push(...streams);
    }

    return results;
  } catch (err) {
    console.error(TAG, "MovieBox scraper error:", err.message);
    return [];
  }
}

async function getStreams(tmdbId, type = "movie", season = null, episode = null) {
  const mediaType = (type === "series" || type === "tv") ? "tv" : "movie";
  const se = mediaType === "tv" ? (season ? parseInt(season, 10) : 1) : null;
  const ep = mediaType === "tv" ? (episode ? parseInt(episode, 10) : 1) : null;

  const tmdbMeta = await getTMDBDetails(tmdbId, mediaType);
  if (!tmdbMeta || !tmdbMeta.title) return [];

  return scrape({
    title: tmdbMeta.title,
    year: tmdbMeta.year,
    type: mediaType,
    season: se,
    episode: ep,
    imdbId: tmdbMeta.imdbId
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getStreams,
    scrape
  };
}
