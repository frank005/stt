// ============================================================================
// AGORA RTC EVENT HANDLERS
// ============================================================================
// This module handles real-time events from the Agora RTC client:
// - User join/leave
// - Media published/unpublished
// - Stream messages (transcription/translation data)

/**
 * Subscribe to a remote user's media (audio or video)
 * 
 * When a remote user publishes media, we:
 * 1. Subscribe to receive their stream
 * 2. Create UI elements to display video and transcriptions
 * 3. Initialize language selector for translation viewing
 * 
 * @param {Object} user - Agora user object with tracks
 * @param {string} mediaType - "audio" or "video"
 */
async function subscribe(user, mediaType) {
  const uid = user.uid;
  await client.subscribe(user, mediaType);
  console.log(`[${new Date().toLocaleTimeString()}] Subscribed to ${uid} for ${mediaType}`);
  
  if (mediaType === "video") {
    // Clean up any existing container (prevents duplicates)
    $(`#video-wrapper-${uid}`).remove();
    
    // Create video container with transcription overlay structure
    const player = $(`
      <div id="video-wrapper-${uid}" class="video-wrapper">
        <div class="language-selector">
          <select id="translation-lang-${uid}" 
                  class="bg-gray-800 rounded px-2 py-1 text-sm" 
                  onchange="updateTranslationView('${uid}')">
          </select>
        </div>
        <div class="video-container">
          <div id="player-${uid}" class="w-full h-full"></div>
          <div class="transcription-overlay">
            <div id="transcriptioncaps-${uid}" class="text-xl mb-2"></div>
            <div id="translationcaps-${uid}" class="text-gray-300"></div>
          </div>
        </div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    
    // Play the video track in the container
    user.videoTrack.play(`player-${uid}`);
    
    // Initialize the translation language selector dropdown
    updateLanguageSelector(uid);
  }
  
  if (mediaType === "audio") {
    // Audio plays automatically through system speakers
    user.audioTrack.play();
  }
}

/**
 * Handle stream messages from the STT agent
 * 
 * The STT agent publishes transcription and translation results as binary
 * protobuf messages via Agora's Data Stream feature. This handler:
 * 1. Decodes the binary message using protobuf schema
 * 2. Extracts transcription or translation data
 * 3. Updates the appropriate UI overlay
 * 4. Manages overlay visibility (auto-hide after 5 seconds)
 * 
 * Message types:
 * - "transcribe": Contains original transcribed words
 * - "translate": Contains translations in multiple target languages
 */
client.on("stream-message", function(uid, data) {
  try {
    // Decode the protobuf message using our schema definition
    const Text = $protobufRoot.lookup("agora.audio2text.Text");
    const msg = Text.decode(data);
    
    // Show the transcription overlay and start auto-hide timer
    showOverlay(msg.uid);
    
    // Get current timestamp for logging
    const timestamp = new Date().toLocaleTimeString();
    
    // Handle transcription messages
    if (msg.data_type === "transcribe" && msg.words && msg.words.length) {
      // Join all word fragments into a single string
      const text = msg.words.map(word => word.text).join("");
      
      // Update the transcription overlay for this user
      $(`#video-wrapper-${msg.uid} #transcriptioncaps-${msg.uid}`).text(text);
      
      console.log(`[${timestamp}] Transcription from ${msg.uid}: ${text}`);
      
      // Optional: Add to history log
      addTranscribeItem(msg.uid, text);
    } 
    // Handle translation messages
    else if (msg.data_type === "translate" && msg.trans && msg.trans.length) {
      // Get the user's currently selected translation language
      const selectedLang = $(`#translation-lang-${msg.uid}`).val();
      
      // Find the translation for the selected language
      // msg.trans is an array of translations (one per target language)
      const translation = msg.trans.find(t => t.lang === selectedLang);
      
      if (translation) {
        const text = translation.texts.join("");
        
        // Update the translation overlay for this user
        $(`#video-wrapper-${msg.uid} #translationcaps-${msg.uid}`).text(text);
        
        console.log(`[${timestamp}] Translation (${selectedLang}) from ${msg.uid}: ${text}`);
        
        // Optional: Add to history log
        addTranslateItem(msg.uid, text);
      }
    }
  } catch (error) {
    console.error("Error handling stream message:", error);
    // Don't throw - gracefully handle decode errors
  }
});

/**
 * Handle remote user publishing media
 * 
 * When a remote user publishes audio or video:
 * 1. Automatically subscribe to their stream
 * 2. Create UI elements for video display
 * 3. Play the media (video renders in DOM, audio plays through speakers)
 * 
 * Note: This can fire multiple times if a user unpublishes and republishes.
 * We check for existing containers to prevent duplicates.
 */
client.on("user-published", async function(user, mediaType) {
  // Subscribe to receive the media stream
  await client.subscribe(user, mediaType);
  
  if (mediaType === "video") {
    // Check if container already exists (prevent duplicate video tiles)
    const existingContainers = $(`[id^="video-wrapper-${user.uid}"]`);
    if (existingContainers.length) {
      // Remove duplicate containers, keep only the first
      existingContainers.slice(1).remove();
      
      // If video is already playing, no need to recreate
      if ($(`#player-${user.uid} video`).length) {
        return;
      }
    }

    // Clean up any orphaned player divs (shouldn't happen, but defensive)
    $(`#player-${user.uid}`).not(`#video-wrapper-${user.uid} #player-${user.uid}`).remove();

    // Create complete video container with transcription support
    const playerContainer = $(`
      <div id="video-wrapper-${user.uid}" class="video-wrapper">
        <div class="language-selector">
          <select id="translation-lang-${user.uid}" 
                  class="bg-gray-800 rounded px-2 py-1 text-sm" 
                  onchange="updateTranslationView('${user.uid}')">
          </select>
        </div>
        <div class="remote-video">
          <div id="player-${user.uid}" class="w-full h-full"></div>
          <div class="transcription-overlay">
            <div id="transcriptioncaps-${user.uid}" class="text-xl mb-2"></div>
            <div id="translationcaps-${user.uid}" class="text-gray-300"></div>
          </div>
        </div>
      </div>
    `);

    // Only append if container doesn't exist
    if (!$(`#video-wrapper-${user.uid}`).length) {
      $("#remote-playerlist").append(playerContainer);
    }
    
    // Play the video track in the container
    user.videoTrack.play(`player-${user.uid}`);
    
    // Initialize translation language selector
    updateLanguageSelector(user.uid);
  }
  
  if (mediaType === "audio") {
    // Play audio through system speakers
    user.audioTrack.play();
  }
});

/**
 * Handle remote user unpublishing media
 * 
 * When a user stops publishing or leaves the channel:
 * 1. Clear any pending overlay auto-hide timers
 * 2. Remove their video container and UI elements
 * 
 * This is called when:
 * - User explicitly unpublishes (stops camera/mic)
 * - User leaves the channel
 * - Network connection drops
 */
client.on("user-unpublished", function(user) {
  // Clear pending overlay timeout to prevent memory leaks
  if (overlayTimeouts.has(user.uid)) {
    clearTimeout(overlayTimeouts.get(user.uid));
    overlayTimeouts.delete(user.uid);
  }
  
  // Remove all UI elements for this user
  $(`[id^="video-wrapper-${user.uid}"]`).remove();
  $(`[id^="player-${user.uid}"]`).remove();
});

