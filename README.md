# Real-Time Transcription (STT)

A web app for real-time speech-to-text (STT) transcription and translation using Agora's Real-Time STT REST API. Supports both 6.x and 7.x API versions, with dynamic UI and configuration.

## Features
- Join an Agora channel and stream audio/video
- Real-time transcription and translation overlays for local and remote users
- Supports both Agora STT 6.x and 7.x APIs
- Dynamic configuration for speaking and translation languages
- Storage and encryption options
- Responsive, modern UI with Tailwind CSS
- Inline error alerts and user-friendly popups

## Setup
1. **Clone the repository:**
   ```sh
   git clone https://github.com/frank005/stt.git
   cd stt
   ```
2. **Install a static server (optional):**
   You can use [serve](https://www.npmjs.com/package/serve) or any static file server:
   ```sh
   npx serve
   ```
   Or use your preferred static server to serve the directory.
3. **Open `index.html` in your browser** (or use the local server URL).

## Usage
1. Click **Connection Settings** to enter your Agora App ID, channel, and (optionally) UID.
2. Click **STT Settings** to configure:
   - **STT Version:** Choose 6.x or 7.x (affects API and language limits)
   - **Customer Key/Secret:** Your Agora STT credentials
   - **Speaking Languages:** Up to 2 (6.x) or 4 (7.x) source languages
   - **Translation Pairs:** Add source/target language pairs (limits depend on version)
   - **Bot, Encryption, and Storage settings** as needed
3. Click **Join** to enter the channel.
4. Click **Start RTT** to begin transcription/translation.
5. View real-time overlays and switch translation languages per user.
6. Click **Stop RTT** and **Leave** as needed.

## Configuration Notes
- **STT Version:**
  - 6.x: Uses `/v1/projects/{appid}/rtsc/speech-to-text` endpoints, requires token acquisition, supports up to 2 source languages.
  - 7.x: Uses `/api/speech-to-text/v1/projects/{appid}` endpoints, no separate token, supports up to 4 source languages, and has a different payload/response format.
- **Browser Compatibility:**
  - The app uses the HTML `<dialog>` element for modals. For best results, use a modern browser (Chrome, Edge, Firefox, Safari). If you experience issues, try updating your browser.

## GitHub
[https://github.com/frank005/stt](https://github.com/frank005/stt)

---

**MIT License** 