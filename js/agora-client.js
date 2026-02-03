// Agora RTC client setup and event handlers

// Update the subscribe function to include transcription overlay
async function subscribe(user, mediaType) {
  const uid = user.uid;
  await client.subscribe(user, mediaType);
  console.log(`[${new Date().toLocaleTimeString()}] Subscribed to ${uid} for ${mediaType}`);
  
  if (mediaType === "video") {
    // Remove any existing container for this user first
    $(`#video-wrapper-${uid}`).remove();
    
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
    user.videoTrack.play(`player-${uid}`);
    updateLanguageSelector(uid);
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
}

// Host automatically sends transcription + translation languages; joiners receive and update transcript UI only
var STT_LANGUAGES_MSG_TYPE = "stt-languages";

function sendSttLanguagesToChannel() {
  if (!taskId || !client) return;
  try {
    var speaking = getSpeakingLanguagesConfig();
    var pairs = (translationSettings.pairs || []).map(function (p) {
      return { source: p.source, targets: p.targets || [] };
    });
    var payload = { type: STT_LANGUAGES_MSG_TYPE, speaking: speaking, translationPairs: pairs };
    client.sendStreamMessage(stringToUint8Array(JSON.stringify(payload)));
  } catch (e) {
    console.error("Failed to send STT languages to channel:", e);
  }
}

// Update stream message handler
client.on("stream-message", function(uid, data) {
  try {
    if (data && (data instanceof Uint8Array ? data[0] === 0x7B : (data.byteLength && new Uint8Array(data)[0] === 0x7B))) {
      try {
        var str = utf8ArrayToString(data);
        var parsed = JSON.parse(str);
        if (parsed && parsed.type === STT_LANGUAGES_MSG_TYPE && !taskId) {
          setBroadcastedSupportedLanguages({ speaking: parsed.speaking || [], translationPairs: parsed.translationPairs || [] });
          if (typeof renderTranscriptsModalContent === "function") renderTranscriptsModalContent();
          return;
        }
      } catch (e) {}
    }

    const Text = $protobufRoot.lookup("agora.audio2text.Text");
    const msg = Text.decode(data);
    
    // Show overlay whenever a message is received
    showOverlay(msg.uid);
    
    // Get current timestamp
    const timestamp = new Date().toLocaleTimeString();
    
    if (msg.data_type === "transcribe" && msg.words && msg.words.length) {
      const text = msg.words.map(word => word.text).join("");
      $(`#video-wrapper-${msg.uid} #transcriptioncaps-${msg.uid}`).text(text);
      console.log(`[${timestamp}] Transcription from ${msg.uid}: ${text}`);
      addTranscribeItem(msg.uid, text);
      // Only add to history when we have a final segment
      const hasFinal = msg.words.some(w => w.isFinal === true);
      if (hasFinal && text.trim()) {
        var speakingLangs = getSpeakingLanguagesConfig();
        var idx = typeof msg.lang === 'number' ? msg.lang : (msg.lang != null ? parseInt(msg.lang, 10) : NaN);
        var sourceLang = (!isNaN(idx) && speakingLangs[idx] != null) ? speakingLangs[idx] : undefined;
        if (!sourceLang && speakingLangs.length === 1) sourceLang = speakingLangs[0];
        transcriptHistory.push({
          uid: msg.uid,
          time: timestamp,
          transcriptText: text.trim(),
          sourceLang: sourceLang,
          translations: {}
        });
      }
    }
    else if (msg.data_type === "translate" && msg.trans && msg.trans.length) {
      const selectedLang = $(`#translation-lang-${msg.uid}`).val();
      const translation = msg.trans.find(t => t.lang === selectedLang);
      if (translation) {
        const text = translation.texts.join("");
        $(`#video-wrapper-${msg.uid} #translationcaps-${msg.uid}`).text(text);
        console.log(`[${timestamp}] Translation (${selectedLang}) from ${msg.uid}: ${text}`);
        addTranslateItem(msg.uid, text);
      }
      // Add final translations to the last transcript segment for this uid
      let segmentToUpdate = transcriptHistory.filter(s => s.uid === msg.uid).pop();
      msg.trans.forEach(t => {
        if (t.isFinal === true && t.texts && t.texts.length) {
          const transText = t.texts.join("").trim();
          if (transText) {
            if (segmentToUpdate) {
              segmentToUpdate.translations[t.lang] = transText;
            } else {
              const newSeg = {
                uid: msg.uid,
                time: timestamp,
                transcriptText: "",
                translations: { [t.lang]: transText }
              };
              transcriptHistory.push(newSeg);
              segmentToUpdate = newSeg;
            }
          }
        }
      });
    }
  } catch (error) {
    console.error("Error handling stream message:", error);
  }
});

// Update remote video handling
client.on("user-published", async function(user, mediaType) {
  await client.subscribe(user, mediaType);
  
  if (mediaType === "video") {
    // Check if container already exists and remove any duplicates
    const existingContainers = $(`[id^="video-wrapper-${user.uid}"]`);
    if (existingContainers.length) {
      // Keep only the first container and remove others
      existingContainers.slice(1).remove();
      // If first container already has video playing, just return
      if ($(`#player-${user.uid} video`).length) {
        return;
      }
    }

    // Remove any orphaned player divs
    $(`#player-${user.uid}`).not(`#video-wrapper-${user.uid} #player-${user.uid}`).remove();

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
    
    user.videoTrack.play(`player-${user.uid}`);
    updateLanguageSelector(user.uid);
  }
  
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
  if (taskId) sendSttLanguagesToChannel();
});

// Update user-unpublished handler to be more thorough
client.on("user-unpublished", function(user) {
  // Clear timeout if exists
  if (overlayTimeouts.has(user.uid)) {
    clearTimeout(overlayTimeouts.get(user.uid));
    overlayTimeouts.delete(user.uid);
  }
  
  // Remove elements
  $(`[id^="video-wrapper-${user.uid}"]`).remove();
  $(`[id^="player-${user.uid}"]`).remove();
});

