# Building Real-Time Speech-to-Text with Translation Using Agora

If you've ever struggled to understand someone speaking a different language in a video call, you know the frustration. This guide walks you through building a web application that transcribes speech in real-time and translates it to multiple languages—all while the conversation is happening.

## What We're Building

A browser-based application that:
- Joins an Agora video channel
- Transcribes spoken words in real-time
- Translates transcriptions to multiple target languages
- Displays both transcription and translation as transparent overlays on video
- Allows dynamic control of translation during active sessions

By the end, you'll understand how Agora's Speech-to-Text API works, how to decode protobuf messages, and how to manage real-time translation configurations.

## Architecture Overview

The application follows a modular structure with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   UI Layer   │───▶│  Agora RTC   │───▶│  STT Agent   │  │
│  │  (index.html)│◀───│   Client     │◀───│  (Backend)   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          JavaScript Modules                          │  │
│  │  • config.js - Global state and initialization      │  │
│  │  • main.js - Event handlers and flow control        │  │
│  │  • agora-client.js - RTC event listeners            │  │
│  │  • transcription.js - STT API integration           │  │
│  │  • translation.js - Real-time translation control   │  │
│  │  • ui.js - UI updates and interactions              │  │
│  │  • settings.js - Configuration management           │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Protobuf Decoder                            │  │
│  │  Decodes binary stream messages from STT agent       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Why this architecture?**

1. **Separation of concerns**: Each module handles a specific responsibility
2. **Testability**: You can test each module independently
3. **Maintainability**: Changes to one area don't cascade through the entire codebase
4. **Clarity**: The data flow is explicit and traceable

## The Complete User Flow

Before diving into code, let's understand what happens when a user interacts with the application:

```
User Opens App
    │
    ├─▶ Configure Connection Settings
    │   (App ID, Channel Name, UID)
    │
    ├─▶ Configure STT Settings
    │   (API version, credentials, languages)
    │
    ├─▶ Click "Join"
    │   └─▶ Create audio/video tracks
    │   └─▶ Publish to Agora channel
    │   └─▶ Subscribe to remote users
    │
    ├─▶ Click "Start RTT"
    │   └─▶ Call Agora STT API
    │   └─▶ STT agent joins channel
    │   └─▶ Agent subscribes to all users
    │   └─▶ Agent publishes transcription via stream messages
    │
    ├─▶ Speak into microphone
    │   └─▶ Audio streams to channel
    │   └─▶ STT agent transcribes
    │   └─▶ Agent encodes result as protobuf
    │   └─▶ Client receives stream message
    │   └─▶ Client decodes and displays overlay
    │
    ├─▶ (Optional) Enable/Disable Translation
    │   └─▶ Update task configuration via API
    │   └─▶ Agent adjusts translation behavior
    │
    └─▶ Click "Stop RTT" → Click "Leave"
        └─▶ Clean up tracks and connections
```

## Part 1: Setting Up the Foundation

### Project Structure

```
project/
├── index.html              # UI and structure
├── css/
│   └── styles.css          # Modern gradient-based styling
├── js/
│   ├── config.js           # Global configuration
│   ├── main.js             # Main application flow
│   ├── agora-client.js     # RTC event handlers
│   ├── transcription.js    # STT API calls
│   ├── translation.js      # Translation management
│   ├── ui.js               # UI updates
│   └── settings.js         # Settings UI logic
└── proto/
    ├── protobuf.min.js     # Protobuf library
    └── index.js            # Message schema definition
```

### Essential Dependencies

The application relies on three external libraries loaded via CDN:

```html
<!-- Tailwind CSS for rapid UI development -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- jQuery for DOM manipulation (legacy, could be replaced) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.4/jquery.min.js"></script>

<!-- Agora RTC SDK for video/audio -->
<script src="https://download.agora.io/sdk/release/AgoraRTC_N.js"></script>

<!-- Protobuf for decoding stream messages -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/protobufjs/6.11.3/protobuf.min.js"></script>
```

**Why these choices?**

- **Tailwind CSS**: Allows rapid prototyping without writing custom CSS
- **jQuery**: Simplifies DOM manipulation (though modern vanilla JS could replace it)
- **Agora RTC SDK**: Handles WebRTC complexity—connection management, codec negotiation, network optimization
- **Protobuf**: Efficient binary serialization format used by Agora for stream messages

## Part 2: Understanding Agora's STT API

### Two API Versions: 6.x vs 7.x

Agora offers two versions of the STT API with significant differences:

| Feature | 6.x | 7.x |
|---------|-----|-----|
| **Endpoint** | `/v1/projects/{appid}/rtsc/speech-to-text` | `/api/speech-to-text/v1/projects/{appid}` |
| **Token acquisition** | Requires separate token call | No separate token needed |
| **Max speaking languages** | 2 | 4 |
| **Max translation source languages** | 2 | 4 |
| **Start method** | `POST /tasks?builderToken={token}` | `POST /join` |
| **Stop method** | `DELETE /tasks/{taskId}` | `POST /agents/{agentId}/leave` |
| **Update method** | `PATCH /tasks/{taskId}?updateMask={mask}` | `POST /agents/{agentId}/update?updateMask={mask}` |

**Which should you use?**

Version 7.x is newer and more flexible. It:
- Simplifies authentication (no separate token)
- Supports more languages simultaneously
- Uses cleaner endpoint naming

Choose 6.x only if you need compatibility with existing infrastructure or have specific requirements documented in legacy systems.

### How the STT API Works

When you start transcription, here's what happens behind the scenes:

1. **You call the STT API** with your configuration
2. **Agora creates an STT "agent"** (a virtual bot)
3. **The agent joins your Agora channel** with a specific UID you provide
4. **The agent subscribes to all users** in the channel
5. **The agent listens to audio streams** and processes them
6. **The agent publishes transcription results** back to the channel as **stream messages**
7. **Your application receives these messages** and decodes them
8. **You display the transcription** to your users

The key insight: **The STT agent is a participant in your channel**. It receives audio like any other user and publishes data back via Agora's Data Stream functionality.

### Authentication

Both API versions use HTTP Basic Authentication:

```javascript
function GetAuthorization() {
  const customerKey = $("#key").val();      // From Agora Console
  const customerSecret = $("#secret").val(); // From Agora Console
  
  if (!customerKey || !customerSecret) {
    throw new Error("Please configure STT credentials");
  }
  
  // Base64 encode the credentials
  return `Basic ${btoa(`${customerKey}:${customerSecret}`)}`;
}
```

**Where do you get these credentials?**

1. Log in to [Agora Console](https://console.agora.io)
2. Navigate to your project
3. Go to Extensions → Speech-to-Text
4. Copy your Customer Key and Customer Secret

**Security note**: In production, never expose these credentials in client-side code. Call the STT API from your backend server, which securely stores credentials.

## Part 3: Initializing the Agora RTC Client

### Creating the Client

The Agora RTC client manages your connection to the channel:

```javascript
// Initialize as a "live" broadcast client in "host" mode
const client = AgoraRTC.createClient({
  mode: "live",    // "live" for broadcast, "rtc" for communication
  codec: "vp8",    // Video codec (vp8 or h264)
  role: "host"     // "host" can publish, "audience" can only subscribe
});
```

**Why these settings?**

- **mode: "live"**: Optimizes for scenarios where a few users broadcast to many viewers. If everyone is equal, use "rtc" mode instead.
- **codec: "vp8"**: VP8 has better browser support than H.264. For mobile apps, H.264 might be preferable.
- **role: "host"**: Only hosts can publish media. This prevents unwanted audio/video from audience members.

### Global State Management

The application maintains state in global variables (in `config.js`):

```javascript
// Connection configuration
var options = {
  appid: null,      // Your Agora App ID
  channel: null,    // Channel name
  uid: null,        // User ID (can be null for auto-assignment)
  token: null       // RTC token (null for testing without security)
};

// STT configuration
let taskId = '';               // Current STT task/agent ID
let tokenName = '';            // Token for 6.x API (not used in 7.x)
let sttVersion = "7.x";        // API version
let translationEnabled = false; // Current translation state

// Translation settings stored persistently
let translationSettings = {
  pairs: []  // Array of {source, targets} objects
};
```

**Why global variables?**

In a larger application, you'd use a state management library like Redux or Zustand. For this demo, globals keep things simple and make state accessible across modules.

### Joining a Channel

Here's the complete flow for joining a channel:

```javascript
$("#join").click(async function() {
  // Validate configuration
  if (!options.appid || !options.channel) {
    showPopup("Please configure connection settings first");
    return;
  }
  
  // Parse UID (can be string or integer)
  const uidVal = $("#uid").val();
  const uidString = $("#uid-string").is(":checked");
  let joinUid = null;
  
  if (uidVal !== '') {
    // Convert to number if not using string UID
    joinUid = uidString ? uidVal : parseInt(uidVal, 10);
    if (!uidString && isNaN(joinUid)) joinUid = null;
  }
  
  try {
    // Join the channel (returns assigned UID if joinUid is null)
    options.uid = await client.join(
      options.appid,
      options.channel,
      null,      // RTC token (null for testing)
      joinUid    // Desired UID (null for auto-assignment)
    );
    
    console.log("Joined with UID:", options.uid);
    
    // Create microphone and camera tracks
    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localAudioTrack = audioTrack;
    localTrack = videoTrack;
    
    // Publish both tracks to the channel
    await client.publish([audioTrack, videoTrack]);
    
    // Display local video
    videoTrack.play("local-player");
    
    // Initialize UI for transcription display
    updateLanguageSelector(options.uid);
    updateButtonStates('joined');
    
    showPopup("Joined channel successfully");
  } catch (error) {
    console.error(error);
    showPopup("Failed to join channel: " + error.message);
  }
});
```

**Key points:**

1. **UID flexibility**: Agora supports both integer and string UIDs. Strings are useful when you want to use usernames or GUIDs.
2. **Track creation**: `createMicrophoneAndCameraTracks()` requests browser permissions and creates media tracks.
3. **Publishing**: After publishing, all channel participants receive your audio/video streams.
4. **Error handling**: Always wrap async operations in try/catch. Network issues are common in WebRTC.

## Part 4: Starting Transcription

### Building the Request Body

The STT API requires a detailed configuration. Here's how we build it:

```javascript
function buildStartRequestBody() {
  // Core configuration
  const body = {
    // Speaking languages (source languages for transcription)
    languages: Array.from(document.querySelectorAll('#speaking-languages input'))
      .map(input => input.value)
      .filter(value => value.trim() !== ''),
    
    // How long the agent waits for audio before timing out
    maxIdleTime: parseInt($("#max-idle-time").val()) || 60,
    
    // RTC configuration for the agent
    rtcConfig: {
      channelName: options.channel,
      pubBotUid: $("#pusher-uid").val(),    // UID for publishing results
      subBotUid: $("#puller-uid").val(),    // UID for subscribing to audio
    }
  };
  
  // Add agent name for 7.x
  if (sttVersion === "7.x") {
    body.name = options.channel;
  }
  
  // Optional: RTC tokens for the agent
  const pushToken = $("#pusher-token").val();
  if (pushToken) body.rtcConfig.pubBotToken = pushToken;
  
  const pullToken = $("#puller-token").val();
  if (pullToken) body.rtcConfig.subBotToken = pullToken;
  
  // Optional: Encryption settings
  const decryptionMode = $("#decryption-mode").val();
  const secret = $("#encryption-secret").val();
  const salt = $("#encryption-salt").val();
  
  if (decryptionMode) body.rtcConfig.cryptionMode = parseInt(decryptionMode);
  if (secret) body.rtcConfig.secret = secret;
  if (salt) body.rtcConfig.salt = salt;
  
  // Translation configuration
  const translationPairs = Array.from(document.querySelectorAll('.translation-pair'))
    .map(pair => {
      const source = pair.querySelector('.source-lang').value;
      const targets = Array.from(pair.querySelectorAll('.target-languages input'))
        .map(input => input.value);
      return { source, target: targets };
    })
    .filter(pair => pair.source && pair.target.length > 0);
  
  if (translationPairs.length > 0) {
    body.translateConfig = {
      enable: true,
      forceTranslateInterval: 5,  // Seconds between forced translations
      languages: translationPairs
    };
  }
  
  // Optional: Storage configuration for saving transcripts
  const s3Bucket = $("#s3-bucket").val();
  if (s3Bucket) {
    body.captionConfig = {
      sliceDuration: 60,  // Save every 60 seconds
      storage: {
        bucket: s3Bucket,
        accessKey: $("#s3-access-key").val(),
        secretKey: $("#s3-secret-key").val(),
        vendor: parseInt($("#s3-vendor").val() || "1"),
        region: parseInt($("#s3-region").val() || "0"),
        fileNamePrefix: [$("#s3-fileNamePrefix").val()]
      }
    };
  }
  
  return body;
}
```

**Understanding the configuration:**

- **languages**: Array of locale codes (e.g., ["en-US", "zh-CN"]). The agent will transcribe any of these languages it detects.
- **maxIdleTime**: If no speech is detected for this duration, the agent stops. Useful for cost management.
- **pubBotUid / subBotUid**: In 6.x, these must be different UIDs. In 7.x, they can be the same.
- **translateConfig.forceTranslateInterval**: Even if speech is ongoing, force a translation every N seconds. This ensures translations don't lag too far behind.
- **captionConfig**: Saves transcripts to cloud storage (S3-compatible). Useful for archival or post-processing.

### Making the API Call

```javascript
async function startTranscription() {
  // Get authentication
  const authorization = GetAuthorization();
  if (!authorization) {
    throw new Error("key or secret is empty");
  }
  
  // For 6.x, acquire a token first
  if (sttVersion === "6.x") {
    const data = await acquireToken();
    tokenName = data.tokenName;
  }
  
  // Build request body
  const body = buildStartRequestBody();
  
  console.log("Starting transcription with body:", body);
  
  // Determine endpoint based on version
  let url;
  if (sttVersion === "7.x") {
    url = `${gatewayAddress}/api/speech-to-text/v1/projects/${options.appid}/join`;
  } else {
    url = `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/tasks?builderToken=${tokenName}`;
  }
  
  // Make the request
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": authorization
    },
    body: JSON.stringify(body)
  });
  
  // Parse response
  const responseText = await res.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { message: responseText };
  }
  
  // Handle errors
  if (!res.ok) {
    // Special case: task already exists (409 conflict)
    if (res.status === 409 && responseData.taskId) {
      taskId = responseData.taskId;
      updateButtonStates('transcribing');
      return { taskId };
    }
    throw new Error(responseData.message || `HTTP error ${res.status}`);
  }
  
  // Extract task/agent ID based on version
  if (sttVersion === "7.x") {
    if (!responseData.agent_id) {
      throw new Error("No agent_id received from server");
    }
    taskId = responseData.agent_id;
    
    if (responseData.status !== "RUNNING") {
      throw new Error(`Unexpected status: ${responseData.status}`);
    }
  } else {
    if (!responseData.taskId) {
      throw new Error("No taskId received from server");
    }
    taskId = responseData.taskId;
  }
  
  // Update UI state
  updateButtonStates('transcribing');
  
  // Track translation state
  if (body.translateConfig && body.translateConfig.enable) {
    translationEnabled = true;
  } else {
    translationEnabled = false;
  }
  updateTranslationStatus();
  
  return responseData;
}
```

**Why this approach?**

- **Version abstraction**: The function handles both API versions transparently
- **Error recovery**: The 409 handling allows recovering from network glitches where the task already started
- **State tracking**: Immediately update UI to prevent user confusion
- **Detailed logging**: The request body is logged for debugging

### Token Acquisition (6.x only)

For version 6.x, you must acquire a token before starting:

```javascript
async function acquireToken() {
  const url = `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/builderTokens`;
  const data = { instanceId: options.channel };
  
  let res = await fetch(url, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": GetAuthorization()
    },
    body: JSON.stringify(data)
  });
  
  if (res.status == 200) {
    res = await res.json();
    return res;  // Contains { tokenName: "..." }
  } else {
    throw new Error(`Failed to acquire token: ${res.status}`);
  }
}
```

This token is then passed as a query parameter in subsequent requests. Version 7.x eliminates this extra roundtrip.

## Part 5: Receiving and Decoding Transcriptions

### Understanding Protobuf Messages

Agora sends transcription results as binary protobuf messages via the Data Stream. Protobuf (Protocol Buffers) is a binary serialization format that's more efficient than JSON for real-time communication.

**Why Agora uses protobuf:**
- **Compact**: Messages are much smaller, reducing network bandwidth
- **Fast**: Binary parsing is faster than JSON, reducing latency
- **Reliable**: Type-safe schema prevents decoding errors

**What you need to know:**

The STT agent sends two types of messages, identified by the `data_type` field:
1. **"transcribe"** - Contains the original transcribed text with word-level timing and confidence scores
2. **"translate"** - Contains translations in multiple target languages (if translation is enabled)

Each message includes:
- **uid** - Which user is speaking
- **words** - Array of transcribed text
- **trans** - Array of translations (one per target language)
- **isFinal** - Whether this is the final result or an interim update

The protobuf schema is defined in `proto/index.js` and the decoding happens automatically using the protobuf.js library.

### Handling Stream Messages

When the STT agent publishes results, your app receives them as stream messages. Here's the basic flow:

```javascript
client.on("stream-message", function(uid, data) {
  try {
    // Decode the binary protobuf message
    const Text = $protobufRoot.lookup("agora.audio2text.Text");
    const msg = Text.decode(data);
    
    // Show the overlay
    showOverlay(msg.uid);
    
    // Handle transcription
    if (msg.data_type === "transcribe") {
      const text = msg.words.map(word => word.text).join("");
      $(`#transcriptioncaps-${msg.uid}`).text(text);
    } 
    // Handle translation
    else if (msg.data_type === "translate") {
      const selectedLang = $(`#translation-lang-${msg.uid}`).val();
      const translation = msg.trans.find(t => t.lang === selectedLang);
      if (translation) {
        const text = translation.texts.join("");
        $(`#translationcaps-${msg.uid}`).text(text);
      }
    }
  } catch (error) {
    console.error("Error handling stream message:", error);
  }
});
```

**What's happening:**
1. Listen for stream messages from the channel
2. Decode the binary message using the protobuf schema
3. Check the message type (transcribe or translate)
4. Extract the text and update the appropriate overlay
5. Handle errors gracefully

### Displaying Overlays

The transcription overlay is positioned absolutely over the video:

```html
<div class="transcription-overlay hidden">
  <div id="transcriptioncaps-${uid}" class="text-xl mb-2"></div>
  <div id="translationcaps-${uid}" class="text-gray-300"></div>
</div>
```

With CSS (in `styles.css`):

```css
.transcription-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: transparent;
  padding: 1.5rem;
  color: white;
  z-index: 10;
  text-align: center;
  transition: opacity 0.3s ease;
}

.transcription-overlay div {
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.3);
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  display: block;
  margin-bottom: 0.5rem;
  width: fit-content;
  max-width: 90%;
}

.transcription-overlay.hidden {
  opacity: 0;
  pointer-events: none;
}
```

**Design decisions:**

- **Transparent background**: Users can still see the video
- **Text shadow**: Ensures readability regardless of video content
- **Semi-transparent badge**: Provides context without blocking too much
- **Auto-hide**: Overlay fades out after 5 seconds of no new messages (managed by `overlayTimeouts` in `config.js`)

### Managing Overlay Visibility

To prevent overlays from permanently covering video, we auto-hide them:

```javascript
// In config.js
const overlayTimeouts = new Map(); // uid -> timeout
const OVERLAY_HIDE_DELAY = 5000;   // 5 seconds

// In ui.js
function showOverlay(uid) {
  // Clear existing timeout if any
  if (overlayTimeouts.has(uid)) {
    clearTimeout(overlayTimeouts.get(uid));
  }
  
  // Show overlay
  if (uid === options.uid) {
    // Local user
    $(`.video-container .transcription-overlay`).removeClass('hidden');
  } else {
    // Remote user
    $(`#video-wrapper-${uid} .transcription-overlay`).removeClass('hidden');
  }
  
  // Set new timeout to hide overlay
  const timeout = setTimeout(() => hideOverlay(uid), OVERLAY_HIDE_DELAY);
  overlayTimeouts.set(uid, timeout);
}

function hideOverlay(uid) {
  if (uid === options.uid) {
    $(`.video-container .transcription-overlay`).addClass('hidden');
  } else {
    $(`#video-wrapper-${uid} .transcription-overlay`).removeClass('hidden');
  }
  overlayTimeouts.delete(uid);
}
```

**Why auto-hide?**

Users found persistent overlays distracting. By hiding after 5 seconds, we balance informativeness with video clarity. Each new message resets the timer.

## Part 6: Dynamic Translation Control

One of the most powerful features is the ability to enable, disable, or reconfigure translation without stopping transcription.

### Enabling Translation Mid-Session

```javascript
async function enableTranslationDuringSession() {
  try {
    if (!taskId) {
      showPopup("No active transcription session");
      return;
    }
    
    // Get current translation pairs from settings
    const translationPairs = Array.from(document.querySelectorAll('#translation-pairs .translation-pair'))
      .map(pair => {
        const source = pair.querySelector('.source-lang').value;
        const targets = Array.from(pair.querySelectorAll('.target-languages input'))
          .map(input => input.value);
        return { source, target: targets };
      })
      .filter(pair => pair.source && pair.target.length > 0);
    
    if (translationPairs.length === 0) {
      showPopup("No translation pairs configured. Please configure translation pairs in STT settings first.");
      return;
    }
    
    // Build update request
    const updateMask = "translateConfig.enable,translateConfig.languages";
    const body = {
      translateConfig: {
        enable: true,
        languages: translationPairs
      }
    };
    
    // Call update API
    await updateTaskConfiguration(updateMask, body);
    
    // Update local state
    translationEnabled = true;
    updateTranslationStatus();
    
    // Update UI
    $("#enable-translation").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
    $("#disable-translation").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
    
    showPopup("Translation enabled");
  } catch (error) {
    console.error("Error enabling translation:", error);
    showPopup("Failed to enable translation: " + error.message);
  }
}
```

**What's happening here?**

1. **Validation**: Check that transcription is active
2. **Configuration retrieval**: Get translation pairs from the settings modal
3. **API call**: Use the `updateMask` parameter to tell the API which fields to update
4. **State synchronization**: Update local state to match the API state
5. **UI update**: Disable the "Enable" button and enable the "Disable" button

### The Update Mask Pattern

The `updateMask` parameter is a comma-separated list of field paths:

```javascript
// Update only the enable flag
updateMask = "translateConfig.enable"

// Update both enable flag and languages
updateMask = "translateConfig.enable,translateConfig.languages"

// Update speaking languages
updateMask = "languages"
```

This pattern allows fine-grained updates without resending the entire configuration.

### Disabling Translation

```javascript
async function disableTranslationDuringSession() {
  try {
    if (!taskId) {
      showPopup("No active transcription session");
      return;
    }
    
    const updateMask = "translateConfig.enable";
    const body = {
      translateConfig: {
        enable: false
      }
    };
    
    await updateTaskConfiguration(updateMask, body);
    
    // Update state
    translationEnabled = false;
    updateTranslationStatus();
    
    // Clear translation overlays (but keep transcription)
    $("[id^=translationcaps-]").text("");
    
    // Update UI
    $("#enable-translation").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
    $("#disable-translation").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
    
    showPopup("Translation disabled during session");
  } catch (error) {
    console.error("Error disabling translation:", error);
    showPopup("Failed to disable translation: " + error.message);
  }
}
```

**Why keep the controls visible?**

Even when translation is disabled, we keep the translation controls visible. This reminds users that translation is available and makes it easy to re-enable.

### Updating Translation Languages

Users can also change which languages are being translated:

```javascript
async function updateTranslationLanguagesDuringSession() {
  try {
    if (!taskId) {
      showPopup("No active transcription session");
      return;
    }
    
    // Get translation pairs from the modal
    const translationPairs = Array.from(document.querySelectorAll('#session-translation-pairs .translation-pair-modal'))
      .map(pair => {
        const source = pair.querySelector('.source-lang').value;
        const targets = Array.from(pair.querySelectorAll('.target-languages input'))
          .map(input => input.value);
        return { source, target: targets };
      })
      .filter(pair => pair.source && pair.target.length > 0);
    
    if (translationPairs.length === 0) {
      showPopup("No translation pairs configured. Please configure translation pairs first.");
      return;
    }
    
    // Consolidate pairs by source language (avoid duplicates)
    const consolidatedPairs = {};
    translationPairs.forEach(pair => {
      if (!consolidatedPairs[pair.source]) {
        consolidatedPairs[pair.source] = [];
      }
      pair.target.forEach(target => {
        if (!consolidatedPairs[pair.source].includes(target)) {
          consolidatedPairs[pair.source].push(target);
        }
      });
    });
    
    // Convert back to array format
    const finalPairs = Object.entries(consolidatedPairs).map(([source, targets]) => ({
      source,
      target: targets
    }));
    
    // Update configuration
    const updateMask = "translateConfig.enable,translateConfig.languages";
    const body = {
      translateConfig: {
        enable: true,
        languages: finalPairs
      }
    };
    
    await updateTaskConfiguration(updateMask, body);
    
    // Update state
    translationEnabled = true;
    updateTranslationStatus();
    
    // Sync the main STT settings modal
    updateSTTSettingsFromSession();
    
    showPopup("Translation languages updated and enabled");
    document.getElementById('translationConfigModal').close();
  } catch (error) {
    console.error("Error updating translation languages:", error);
    showPopup("Failed to update translation languages: " + error.message);
  }
}
```

**The consolidation step is crucial:**

If a user configures:
- `en-US → es-ES`
- `en-US → ru-RU`

We consolidate to:
- `en-US → [es-ES, ru-RU]`

This prevents API errors and creates a cleaner language selector UI.

### The Update API Call

```javascript
async function updateTaskConfiguration(updateMask, body) {
  if (!taskId) {
    throw new Error("No active task to update");
  }
  
  let url;
  let method;
  let sequenceId = Date.now(); // Simple sequence ID based on timestamp
  
  // Build URL based on version
  if (sttVersion === "7.x") {
    url = `${gatewayAddress}/api/speech-to-text/v1/projects/${options.appid}/agents/${taskId}/update?sequenceId=${sequenceId}&updateMask=${updateMask}`;
    method = 'POST';
  } else {
    url = `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/tasks/${taskId}?builderToken=${tokenName}&sequenceId=${sequenceId}&updateMask=${updateMask}`;
    method = 'PATCH';
  }
  
  // Make the request
  const response = await fetch(url, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": GetAuthorization()
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update task: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}
```

**Why use sequenceId?**

The `sequenceId` ensures that updates are applied in order. If you send multiple updates rapidly, the API uses the sequence ID to guarantee ordering. Using a timestamp is simple and works for most cases.

## Part 7: Managing Translation Language Selectors

### The Challenge

In a multi-user channel with translation, each user might speak different source languages. The UI needs to let viewers select which translation they want to see for each user.

For example:
- User A speaks English
- User B speaks Chinese
- Translation is configured: `en-US → [es-ES, ru-RU]` and `zh-CN → [en-US, es-ES]`
- Viewer should be able to select Spanish or Russian for User A, and English or Spanish for User B

### Building the Language Selector

```javascript
function updateLanguageSelector(uid) {
  const selector = $(`#translation-lang-${uid}`);
  const currentSelection = selector.val();
  
  // Get all configured target languages from settings
  const consolidatedPairs = {};
  translationSettings.pairs.forEach(pair => {
    if (!consolidatedPairs[pair.source]) {
      consolidatedPairs[pair.source] = [];
    }
    pair.targets.forEach(target => {
      if (!consolidatedPairs[pair.source].includes(target)) {
        consolidatedPairs[pair.source].push(target);
      }
    });
  });
  
  // Create options showing source → target
  const allTargetLanguages = Object.entries(consolidatedPairs).reduce((acc, [source, targets]) => {
    targets.forEach(target => {
      acc.push({ source, target });
    });
    return acc;
  }, []);
  
  // Populate dropdown
  selector.empty();
  allTargetLanguages.forEach(({ source, target }) => {
    const option = $(`<option value="${target}">${source} → ${target}</option>`);
    selector.append(option);
  });
  
  // Restore previous selection if possible
  if (currentSelection && selector.find(`option[value="${currentSelection}"]`).length) {
    selector.val(currentSelection);
  } else {
    selector.find('option:first').prop('selected', true);
  }
  
  console.log(`Language selector for ${uid} set to:`, selector.val());
}
```

**Why show "source → target"?**

Viewers need context. Showing "es-ES" alone doesn't tell them that this is translating from English. The "en-US → es-ES" format makes it clear.

### Persisting User Preferences

```javascript
function updateTranslationView(uid) {
  const selectedLang = $(`#translation-lang-${uid}`).val();
  
  // Save preference to localStorage
  localStorage.setItem(`translation-pref-${uid}`, selectedLang);
  
  // Clear current translation (new one will appear with next message)
  $(`#translationcaps-${uid}`).text('');
}
```

When a user returns to the app, their language preferences are restored:

```javascript
// In updateLanguageSelector, after populating options:
const savedPref = localStorage.getItem(`translation-pref-${uid}`);
if (savedPref && selector.find(`option[value="${savedPref}"]`).length) {
  selector.val(savedPref);
}
```

This creates a seamless experience across sessions.

## Part 8: Stopping Transcription and Cleanup

### Stopping the STT Agent

```javascript
async function stopTranscription() {
  if (!taskId) return;
  
  let url;
  let method;
  
  // Build URL based on version
  if (sttVersion === "7.x") {
    url = `${gatewayAddress}/api/speech-to-text/v1/projects/${options.appid}/agents/${taskId}/leave`;
    method = 'POST';
  } else {
    url = `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/tasks/${taskId}?builderToken=${tokenName}`;
    method = 'DELETE';
  }
  
  // Make the request
  await fetch(url, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": GetAuthorization()
    }
  });
  
  // Reset state
  taskId = null;
  translationEnabled = false;
  
  // Update UI
  $("#enable-translation").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
  $("#disable-translation").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
  $("#translation-controls").addClass('hidden');
  updateButtonStates('joined');
  
  // Clear all caption overlays
  $("[id^=transcriptioncaps-]").text("");
  $("[id^=translationcaps-]").text("");
}
```

**Why clear captions?**

When transcription stops, old captions become stale. Clearing them prevents confusion.

### Leaving the Channel

```javascript
$("#leave").click(async function() {
  try {
    // Clear all overlay timeouts
    overlayTimeouts.forEach((timeout, uid) => {
      clearTimeout(timeout);
    });
    overlayTimeouts.clear();
    
    // Hide all overlays
    $(`.transcription-overlay`).addClass('hidden');
    
    // Stop and close local tracks
    if (localTrack) {
      localTrack.stop();
      localTrack.close();
    }
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.close();
    }
    
    // Leave the channel
    await client.leave();
    
    // Clear UI
    $("#local-player").empty();
    $("#remote-playerlist").empty();
    
    // Update button states
    updateButtonStates('initial');
    
    showPopup("Left channel successfully");
  } catch (error) {
    console.error(error);
    showPopup("Failed to leave channel");
  }
});
```

**The importance of cleanup:**

- **Stop tracks**: Releases camera and microphone
- **Close tracks**: Frees memory
- **Clear timeouts**: Prevents memory leaks from pending callbacks
- **Clear UI**: Removes remote user video elements

Proper cleanup prevents memory leaks and ensures the app can cleanly rejoin.

## Part 9: UI/UX Considerations

### Button State Management

The application uses explicit state management for buttons:

```javascript
function updateButtonStates(state) {
  switch(state) {
    case 'initial':
      // Can join and start RTT (if credentials configured)
      $("#join").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#leave").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#start-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
      break;
      
    case 'joined':
      // Can leave and start RTT
      $("#join").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#leave").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#start-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
      break;
      
    case 'transcribing':
      // Can stop RTT and manage translation
      $("#start-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").removeClass('hidden');
      break;
  }
}
```

**Why explicit states?**

This prevents impossible states (like starting transcription before joining) and makes the flow obvious to users.

### Popup Notifications

For transient feedback, we use popup notifications:

```javascript
var popups = 0; // Track number of active popups

function showPopup(message) {
  const newPopup = popups + 1;
  const y = $(`<div id="popup-${newPopup}" class="popupHidden">${message}</div>`);
  $("#popup-section").append(y);
  
  const x = document.getElementById(`popup-${newPopup}`);
  x.className = "popupShow";
  
  // Offset multiple popups
  const z = popups * 10;
  $(`#popup-${newPopup}`).css("left", `${50 + z}%`);
  
  popups++;
  
  // Auto-remove after 3 seconds
  setTimeout(function() {
    $(`#popup-${newPopup}`).remove();
    popups--;
  }, 3000);
}
```

**Why not use `alert()`?**

- **Non-blocking**: Popups don't interrupt the user
- **Stackable**: Multiple popups can appear simultaneously
- **Branded**: Custom styling matches the app's aesthetic

### Modal Dialogs

Settings are configured via modal dialogs using HTML `<dialog>`:

```html
<dialog id="sttModal">
  <div class="flex items-center gap-3 mb-8 pb-4 border-b border-slate-700/50">
    <h2>STT Settings</h2>
  </div>
  
  <div class="space-y-6">
    <!-- Settings fields -->
  </div>
  
  <div class="flex justify-end gap-4 mt-8">
    <button onclick="this.closest('dialog').close()">Cancel</button>
    <button onclick="saveSTTSettings()">Save</button>
  </div>
</dialog>
```

Opened with:

```javascript
document.getElementById('sttModal').showModal();
```

**Why `<dialog>`?**

- **Built-in backdrop**: Dims the background automatically
- **Focus management**: Traps focus within the modal
- **ESC handling**: Closes on ESC key by default
- **Accessibility**: Better screen reader support than DIV-based modals

## Part 10: Advanced Features

### Request Preview

Before starting transcription, users can preview the exact JSON that will be sent:

```javascript
function previewStartRequest() {
  try {
    // Build the request body (same function used for actual start)
    const body = buildStartRequestBody();
    
    // Format with indentation
    const formattedJson = JSON.stringify(body, null, 2);
    
    // Display in a <pre> element
    document.getElementById('request-body').textContent = formattedJson;
    document.getElementById('request-preview').classList.remove('hidden');
    
    // Scroll to preview
    const sttModal = document.getElementById('sttModal');
    if (sttModal && typeof sttModal.scrollTo === 'function') {
      sttModal.scrollTo({ top: sttModal.scrollHeight, behavior: 'smooth' });
    }
  } catch (error) {
    console.error('Error building request preview:', error);
    showSTTModalAlert('Error building request preview: ' + error.message);
  }
}
```

This feature is invaluable for:
- **Debugging**: Verify your configuration before starting
- **Learning**: Understand the API request format
- **Documentation**: Copy the JSON for API documentation or bug reports

### S3 Storage Integration

For long-term storage of transcripts:

```javascript
// In buildStartRequestBody()
const s3Bucket = $("#s3-bucket").val();
if (s3Bucket) {
  body.captionConfig = {
    sliceDuration: 60,  // Save every 60 seconds
    storage: {
      bucket: s3Bucket,
      accessKey: $("#s3-access-key").val(),
      secretKey: $("#s3-secret-key").val(),
      vendor: parseInt($("#s3-vendor").val() || "1"),  // 1 = AWS, others for different providers
      region: parseInt($("#s3-region").val() || "0"),
      fileNamePrefix: [$("#s3-fileNamePrefix").val()]
    }
  };
}
```

The STT agent will save transcripts as JSON files to your S3 bucket. File names follow the pattern:

```
{fileNamePrefix}_{channelName}_{uid}_{timestamp}.json
```

**Use cases:**
- **Compliance**: Regulatory requirements for call recording
- **Analytics**: Post-process transcripts for insights
- **Archival**: Long-term storage of meeting transcripts

### Encryption Support

If your Agora channel uses encryption:

```javascript
const decryptionMode = $("#decryption-mode").val();
const secret = $("#encryption-secret").val();
const salt = $("#encryption-salt").val();

if (decryptionMode) body.rtcConfig.cryptionMode = parseInt(decryptionMode);
if (secret) body.rtcConfig.secret = secret;
if (salt) body.rtcConfig.salt = salt;
```

The STT agent must use the same encryption settings as your channel to decrypt audio streams.

**Encryption modes:**
- `1`: AES-128-XTS
- `2`: AES-128-ECB
- `3`: AES-256-XTS
- `5`: SM4-128-ECB
- `7`: AES-128-GCM2
- `8`: AES-256-GCM2

## Part 11: Production Considerations

### Security Best Practices

**Never expose credentials in client-side code:**

```javascript
// ❌ BAD: Credentials in frontend
const customerKey = "your-key-here";
const customerSecret = "your-secret-here";

// ✅ GOOD: Call your backend
async function startTranscription() {
  const response = await fetch('/api/start-transcription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: options.channel,
      languages: ['en-US'],
      translationPairs: [{ source: 'en-US', target: ['es-ES'] }]
    })
  });
  
  return await response.json();
}
```

Your backend server:
1. Validates the request
2. Adds credentials
3. Calls Agora STT API
4. Returns the taskId to the client

### Token-Based Channel Security

For production channels, use RTC tokens:

```javascript
// Generate token on your backend
const token = generateAgoraToken(appId, appCertificate, channelName, uid);

// Join with token
options.uid = await client.join(options.appid, options.channel, token, uid);
```

Tokens expire after a configurable duration (default 24 hours), preventing unauthorized access.

### Error Handling

Production apps need comprehensive error handling:

```javascript
async function startTranscription() {
  try {
    const authorization = GetAuthorization();
    
    // ... API call ...
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": authorization
      },
      body: JSON.stringify(body)
    });
    
    // Check HTTP status
    if (!response.ok) {
      const errorData = await response.json();
      
      // Handle specific errors
      switch (response.status) {
        case 401:
          throw new Error("Invalid STT credentials. Please check your key and secret.");
        case 404:
          throw new Error("STT API endpoint not found. Verify your App ID.");
        case 409:
          throw new Error("Transcription task already exists for this channel.");
        case 429:
          throw new Error("Rate limit exceeded. Please try again later.");
        default:
          throw new Error(errorData.message || `HTTP ${response.status}`);
      }
    }
    
    return await response.json();
  } catch (error) {
    console.error("Failed to start transcription:", error);
    
    // User-friendly error display
    if (error.message.includes("NetworkError") || error.message.includes("Failed to fetch")) {
      showPopup("Network error. Please check your connection and try again.");
    } else {
      showPopup(error.message);
    }
    
    // Report to error tracking service
    if (window.Sentry) {
      Sentry.captureException(error);
    }
    
    throw error;
  }
}
```

### Performance Optimization

**Minimize re-renders:**

```javascript
// ❌ BAD: Update on every word
msg.words.forEach(word => {
  $(`#transcriptioncaps-${msg.uid}`).append(word.text);
});

// ✅ GOOD: Batch updates
const text = msg.words.map(word => word.text).join("");
$(`#transcriptioncaps-${msg.uid}`).text(text);
```

**Debounce language selector changes:**

```javascript
let languageSelectorTimeout;

function updateTranslationView(uid) {
  clearTimeout(languageSelectorTimeout);
  
  languageSelectorTimeout = setTimeout(() => {
    const selectedLang = $(`#translation-lang-${uid}`).val();
    localStorage.setItem(`translation-pref-${uid}`, selectedLang);
    $(`#translationcaps-${uid}`).text('');
  }, 300);
}
```

**Lazy-load video elements:**

Only create video containers when users actually publish video, not preemptively.

### Monitoring and Analytics

Track key metrics:

```javascript
// Track transcription latency
let transcriptionStartTime;

async function startTranscription() {
  transcriptionStartTime = Date.now();
  const result = await /* ... API call ... */;
  const latency = Date.now() - transcriptionStartTime;
  
  // Send to analytics
  analytics.track('Transcription Started', {
    latency_ms: latency,
    version: sttVersion,
    languages: body.languages,
    translationEnabled: body.translateConfig?.enable || false
  });
}

// Track message received latency
client.on("stream-message", function(uid, data) {
  const receiveTime = Date.now();
  const msg = Text.decode(data);
  
  // Calculate end-to-end latency
  const latency = receiveTime - msg.time;
  
  analytics.track('Transcription Message Received', {
    latency_ms: latency,
    uid: msg.uid,
    data_type: msg.data_type,
    word_count: msg.words?.length || 0
  });
  
  // ... rest of handling ...
});
```

Track these metrics:
- **Transcription start latency**: Time to initialize the STT agent
- **Message delivery latency**: Time from speech to receiving transcription
- **Translation accuracy**: User feedback on translation quality
- **Error rates**: Failed starts, network errors, etc.

## Part 12: Common Issues and Troubleshooting

### Issue: No Transcription Messages Received

**Possible causes:**
1. STT agent UID conflicts with a user UID
2. Agent hasn't subscribed to users yet (takes a few seconds)
3. No audio is being published
4. Encryption mismatch

**Debugging steps:**

```javascript
// 1. Verify agent joined
console.log(`Agent UID: ${$("#pusher-uid").val()}`);

// 2. Check if client is publishing audio
client.on("user-published", (user, mediaType) => {
  console.log(`User ${user.uid} published ${mediaType}`);
});

// 3. Log stream messages
client.on("stream-message", (uid, data) => {
  console.log(`Stream message from UID ${uid}, size: ${data.byteLength} bytes`);
  // ... decode and display ...
});

// 4. Verify encryption settings
console.log("Encryption mode:", $("#decryption-mode").val());
```

### Issue: Translation Not Appearing

**Possible causes:**
1. Translation not enabled in initial config
2. Wrong target language selected in dropdown
3. Source language doesn't match what user is speaking

**Solution:**

```javascript
// Verify translation config
const config = buildStartRequestBody();
console.log("Translation config:", config.translateConfig);

// Check selected language
client.on("stream-message", (uid, data) => {
  const msg = Text.decode(data);
  if (msg.data_type === "translate") {
    console.log("Available translations:", msg.trans.map(t => t.lang));
    console.log("Selected language:", $(`#translation-lang-${msg.uid}`).val());
  }
});
```

### Issue: High Latency

**Possible causes:**
1. Network congestion
2. Agent processing load
3. Too many translation targets

**Mitigation:**

```javascript
// Reduce translation targets
body.translateConfig = {
  enable: true,
  forceTranslateInterval: 10,  // Increase interval to 10 seconds
  languages: [
    { source: 'en-US', target: ['es-ES'] }  // Limit to 1-2 targets
  ]
};

// Monitor latency
const startTime = Date.now();
client.on("stream-message", (uid, data) => {
  const msg = Text.decode(data);
  console.log(`Latency: ${Date.now() - startTime}ms`);
});
```

### Issue: Agent Stops Unexpectedly

**Possible causes:**
1. `maxIdleTime` reached (no speech detected)
2. Channel became empty (all users left)
3. API error or rate limit

**Solution:**

```javascript
// Increase idle time
body.maxIdleTime = 300;  // 5 minutes

// Monitor agent status
setInterval(async () => {
  if (taskId) {
    try {
      const statusUrl = sttVersion === "7.x" 
        ? `${gatewayAddress}/api/speech-to-text/v1/projects/${options.appid}/agents/${taskId}`
        : `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/tasks/${taskId}`;
      
      const response = await fetch(statusUrl, {
        headers: { "Authorization": GetAuthorization() }
      });
      
      const status = await response.json();
      console.log("Agent status:", status);
    } catch (error) {
      console.error("Failed to check agent status:", error);
    }
  }
}, 30000);  // Check every 30 seconds
```

## Part 13: Testing Your Implementation

### Manual Testing Checklist

1. **Basic Flow**
   - [ ] Join channel successfully
   - [ ] Local video appears
   - [ ] Start transcription without errors
   - [ ] Speak and see transcription overlay
   - [ ] Stop transcription
   - [ ] Leave channel

2. **Multi-User**
   - [ ] Remote user joins and video appears
   - [ ] Remote user's transcription appears on their video
   - [ ] Each user has independent language selector
   - [ ] Leaving user's video is removed

3. **Translation**
   - [ ] Translation appears below transcription
   - [ ] Changing language selector updates translation shown
   - [ ] Enable/disable buttons work during session
   - [ ] Configure modal updates languages in real-time

4. **Edge Cases**
   - [ ] Start transcription before joining (should show error)
   - [ ] Join without credentials (should show error)
   - [ ] Network interruption handling
   - [ ] Rapid start/stop cycles
   - [ ] Empty language configurations

### Automated Testing

For production apps, add automated tests:

```javascript
// Example using Jest
describe('Transcription', () => {
  test('builds correct request body for 7.x', () => {
    // Mock DOM inputs
    document.getElementById = jest.fn((id) => {
      const mocks = {
        'stt-version': { value: '7.x' },
        'max-idle-time': { value: '60' },
        'pusher-uid': { value: '12345' },
        'puller-uid': { value: '12345' }
      };
      return mocks[id] || {};
    });
    
    const body = buildStartRequestBody();
    
    expect(body.name).toBe(options.channel);
    expect(body.maxIdleTime).toBe(60);
    expect(body.rtcConfig.pubBotUid).toBe('12345');
  });
  
  test('consolidates translation pairs', () => {
    const pairs = [
      { source: 'en-US', target: ['es-ES'] },
      { source: 'en-US', target: ['ru-RU'] }
    ];
    
    const consolidated = consolidatePairs(pairs);
    
    expect(consolidated).toEqual([
      { source: 'en-US', target: ['es-ES', 'ru-RU'] }
    ]);
  });
});
```

## Conclusion

You've now built a complete real-time transcription and translation system. The architecture is modular, the API integration is robust, and the user experience is polished.

**Key takeaways:**

1. **Agora's STT API is powerful but requires careful configuration** - Preview your requests before sending
2. **Protobuf decoding is necessary** for receiving transcription messages
3. **Dynamic translation control** enhances user experience significantly
4. **Proper state management** prevents UI bugs and impossible states
5. **Error handling and monitoring** are critical for production

### Next Steps

**Extend the application:**
- Add speaker identification (diarization)
- Implement transcript history/search
- Support multiple simultaneous channels
- Add custom vocabulary for domain-specific terms
- Build mobile apps with React Native
- Integrate with LLMs for real-time summarization

**Optimize for scale:**
- Move STT API calls to backend
- Implement connection pooling
- Add caching for language configurations
- Use WebSockets for real-time updates
- Implement load balancing

The code in this repository is production-ready for small to medium deployments. For enterprise scale, consult Agora's documentation on capacity planning and architecture best practices.

## Resources

- [Agora STT API Documentation](https://docs.agora.io/en/real-time-stt/overview/product-overview)
- [Agora RTC SDK Reference](https://docs.agora.io/en/video-calling/reference/web-sdk)
- [Supported Languages and Locales](https://docs.agora.io/en/real-time-stt/reference/supported-languages)
- [GitHub Repository](https://github.com/AgoraIO-Community/stt)

---

*This guide was written for developers building real-time communication applications. If you found it helpful, star the repository and share your implementations!*

