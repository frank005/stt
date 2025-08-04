# Real-Time Transcription (STT)

A web app for real-time speech-to-text (STT) transcription and translation using Agora's Real-Time STT REST API. Supports both 6.x and 7.x API versions, with dynamic UI and configuration.

## Features
- Join an Agora channel and stream audio/video
- Real-time transcription and translation overlays for local and remote users
- **Real-time translation controls** - Enable/disable translation and update languages during active sessions
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
5. **Real-time Translation Controls** (appear when transcription is active):
   - **Enable:** Re-enable translation with existing or new language configurations
   - **Disable:** Turn off translation during the session
   - **Configure:** Open a modal to modify translation languages in real-time
6. View real-time overlays and switch translation languages per user.
7. Click **Stop RTT** and **Leave** as needed.

## Real-Time Translation Controls

When transcription is active, you'll see additional controls for managing translation:

### Enable Translation
- Re-enables translation with the current language configuration
- If translation was previously disabled, this will turn it back on
- Uses existing language pairs from STT settings

### Disable Translation
- Turns off translation during the active session
- Translation overlays are cleared but settings are preserved
- Controls remain visible so you can re-enable later

### Configure Languages
- Opens a modal to modify translation language pairs in real-time
- Add, remove, or modify source/target language combinations
- Changes are automatically consolidated (multiple pairs with same source are combined)
- Updates both the session configuration and STT settings modal
- **Update Languages** button applies changes immediately

### Smart Consolidation
- Multiple translation pairs with the same source language are automatically combined
- Example: `en-US → es-ES` + `en-US → ru-RU` becomes `en-US → [es-ES, ru-RU]`
- Prevents API errors and UI duplicates
- Maintains clean language selector dropdowns

## Configuration Notes
- **STT Version:**
  - 6.x: Uses `/v1/projects/{appid}/rtsc/speech-to-text` endpoints, requires token acquisition, supports up to 2 source languages.
  - 7.x: Uses `/api/speech-to-text/v1/projects/{appid}` endpoints, no separate token, supports up to 4 source languages, and has a different payload/response format.
- **Translation Controls:**
  - Only visible when transcription is active
  - State is tracked and displayed (Enabled/Disabled)
  - Changes are persisted to localStorage
  - UI stays synchronized between session and settings modals
- **Browser Compatibility:**
  - The app uses the HTML `<dialog>` element for modals. For best results, use a modern browser (Chrome, Edge, Firefox, Safari). If you experience issues, try updating your browser.

## GitHub
[https://github.com/frank005/stt](https://github.com/frank005/stt)

---

**MIT License** 