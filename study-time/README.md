# Study Time — Chrome Extension

Blocks YouTube videos that are not study/educational using Google Gemini JSON-mode.

## Install (developer)
1. Clone this folder (or copy files).
2. Open `chrome://extensions` in Chrome.
3. Enable "Developer mode".
4. Click "Load unpacked" and select this folder.

## Usage
1. Click the extension icon → paste your Gemini API key (from Google AI Studio / Vertex).
2. Optionally set a study playlist in the popup to redirect blocked videos there.
3. Open a YouTube watch page. The extension will call Gemini to classify the video and block if not allowed.

## How it works
- `content.js` extracts the title/description/URL and sends them to the background worker.
- `background.js` calls Gemini REST `generateContent` endpoint in structured JSON mode (`responseMimeType: application/json` + `responseSchema`) and parses the result.
- If `allowed` is false, it directs the content script to redirect or go back.

## Important security note
The extension stores the API key in `chrome.storage.sync`. This is convenient for testing but exposes the key to the local browser profile. For production, consider using a trusted server to proxy requests and keep API keys secret. See Google docs for structured output & the REST examples. :contentReference[oaicite:3]{index=3}
