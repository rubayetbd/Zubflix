# Zubflix - Scraper Plugin

A collection of high-performance, compatible scraper plugins designed for the **Nuvio Android TV Application** media engine. These plugins are built using high-performance, sandboxed ES5 JavaScript to seamlessly resolve high-quality video streaming links, mirror URLs, and high-speed cloud drive nodes.

---

## 📦 How to Install / Integrate in Nuvio

Nuvio scrapers are fully managed through the `manifest.json` configuration index. To install these scrapers in your Nuvio application, you can load our remote repository manifest or host it yourself.

### Option 1: Direct Remote Installation
Input the raw URL of the repository's `manifest.json` directly into your Nuvio App's provider settings panel:
```text
https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>/main/manifest.json
```

### Option 2: Self-Hosting Configuration
If you prefer hosting the scrapers on your own server or local network, copy your `manifest.json` and host it alongside the contents of the `/providers` folder

## 🛠️ Architecture and Technical Design

These plugins follow strict sandboxing guidelines required by modern TV-compatible streaming applications:

1. **Vanilla ES5 Engine Compatibility**: No modern ES6+ syntaxes like `const`, `let`, or arrow functions are used inside `/providers`. This ensures compatibility with the Rhino, QuickJS, or V8 engines running embedded on Android TV architectures.
2. **Lightweight Parsing Layer**: Utilizes `cheerio-without-node-native` to parse HTML structures rapidly and reliably without native bindings.
3. **Smart Priority Engine (`hostConfidence`)**: Stream URLs are parsed and sorted automatically by host speed and uptime reliability, placing premium storage networks (such as Cloudflare R2 and Google Cloud Storage) at the top of the selection queue.
4. **Intelligent Deduplication**: Deduplicates streams based on parsed query paths and stream qualities to present a clean, organized stream layout on the user's TV interface.

---

## 🛡️ Disclaimer

These scraper plugins are designed purely as proof-of-concept developer experiments for parsing web content. They do not host, store, or index any digital video files themselves. Users are solely responsible for compliance with local regulations and intellectual property laws.
