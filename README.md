# Nuvio TV Scraper Plugins

A collection of high-performance, compatible scraper plugins designed for the **Nuvio Android TV Application** media engine. These plugins are built using high-performance, sandboxed ES5 JavaScript to seamlessly resolve high-quality video streaming links, mirror URLs, and high-speed cloud drive nodes.

---

## 🚀 Features

- **MovieLinkBD Scraper (Premium)**: 
  - Fully supports both **Movies** and **TV Shows** (Web Series).
  - Dynamically resolves multiple qualities (`2160p/4K`, `1080p`, `720p`, `480p`, `360p`).
  - Features intelligent host routing with high-priority support for **Fast R2 Cloud**, **Direct Mom**, **Instant Cloud**, and **Direct Open** storage networks.
  - Robust TMDB metadata extraction and fallback link-matching algorithms.
- **4KHDHub Scraper**:
  - High-speed direct downloads and multiple CDN mirror support (Maverick, Odyssey, Fukggl).
  - Automatic stream deduplication and quality routing.
- **VegaMovies Scraper**:
  - Premium high-quality dual-audio and multi-resolution direct link resolver.
- **Resilient Fallback Resolvers**: Integrated silent failure handling and dynamic domain resolution to keep links active even when principal web addresses undergo registrar updates.

---

## 📦 How to Install / Integrate in Nuvio

Nuvio scrapers are fully managed through the `manifest.json` configuration index. To install these scrapers in your Nuvio application, you can load our remote repository manifest or host it yourself.

### Option 1: Direct Remote Installation
Input the raw URL of the repository's `manifest.json` directly into your Nuvio App's provider settings panel:
```text
https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>/main/manifest.json
```

### Option 2: Self-Hosting Configuration
If you prefer hosting the scrapers on your own server or local network, copy your `manifest.json` and host it alongside the contents of the `/providers` folder:

```json
{
  "name": "Nuvio-TV",
  "version": "1.0.0",
  "scrapers": [
    {
      "id": "movielinkbd",
      "name": "MovieLinkBD",
      "description": "Fast cloud drives and watch mirrors from MovieLinkBD",
      "version": "1.0.0",
      "author": "Nuvio Team",
      "supportedTypes": ["movie", "tv"],
      "filename": "providers/movielinkbd.js",
      "enabled": true,
      "formats": ["mp4", "mkv", "m3u8"],
      "logo": "https://i.postimg.cc/mryRTf0R/hdhub4u.png",
      "contentLanguage": ["en", "bn"]
    },
    {
      "id": "4khdhub",
      "name": "4KHDHub",
      "description": "4KHDHub direct links",
      "version": "1.0.0",
      "author": "Nuvio Team",
      "supportedTypes": ["movie", "tv"],
      "filename": "providers/4khdhub.js",
      "enabled": true,
      "formats": ["mp4", "m3u8"],
      "logo": "https://i.postimg.cc/DZpW6Xfb/4khdhub.png",
      "contentLanguage": ["en"]
    }
  ]
}
```

---

## 🛠️ Architecture and Technical Design

These plugins follow strict sandboxing guidelines required by modern TV-compatible streaming applications:

1. **Vanilla ES5 Engine Compatibility**: No modern ES6+ syntaxes like `const`, `let`, or arrow functions are used inside `/providers`. This ensures compatibility with the Rhino, QuickJS, or V8 engines running embedded on Android TV architectures.
2. **Lightweight Parsing Layer**: Utilizes `cheerio-without-node-native` to parse HTML structures rapidly and reliably without native bindings.
3. **Smart Priority Engine (`hostConfidence`)**: Stream URLs are parsed and sorted automatically by host speed and uptime reliability, placing premium storage networks (such as Cloudflare R2 and Google Cloud Storage) at the top of the selection queue.
4. **Intelligent Deduplication**: Deduplicates streams based on parsed query paths and stream qualities to present a clean, organized stream layout on the user's TV interface.

---

## 🛡️ Disclaimer

These scraper plugins are designed purely as proof-of-concept developer experiments for parsing web content. They do not host, store, or index any digital video files themselves. Users are solely responsible for compliance with local regulations and intellectual property laws.
