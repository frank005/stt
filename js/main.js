// Main initialization and event handlers

// Load settings on page load
$(document).ready(function() {
  updateButtonStates('initial');
  loadSavedSettings();
  // Apply version-specific UI changes after settings are loaded
  handleVersionChange();
  
  // COMMENTED OUT: Event listeners for auto-sync behavior
  /*
  // Add event listeners for pub bot fields to sync with sub bot fields in 7.x
  $("#pusher-uid, #pusher-token").on('input', function() {
    if (sttVersion === "7.x") {
      const fieldId = $(this).attr('id');
      const value = $(this).val();
      
      if (fieldId === 'pusher-uid') {
        $("#puller-uid").val(value);
      } else if (fieldId === 'pusher-token') {
        $("#puller-token").val(value);
      }
    }
  });
  */
});

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadTranslationSettings);

// Save settings when STT modal is closed
document.getElementById('sttModal').addEventListener('close', saveTranslationSettings);

// Update join handler
$("#join").click(async function() {
  if (!options.appid || !options.channel) {
    showPopup("Please configure connection settings first");
    return;
  }
  // Get UID and type from input and checkbox
  const uidVal = $("#uid").val();
  const uidString = $("#uid-string").is(":checked");
  let joinUid = null;
  if (uidVal !== '') {
    joinUid = uidString ? uidVal : parseInt(uidVal, 10);
    if (!uidString && isNaN(joinUid)) joinUid = null;
  }
  try {
    options.uid = await client.join(options.appid, options.channel, null, joinUid);
    console.log("Joined with UID:", options.uid);
    
    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localTrack = videoTrack;
    localAudioTrack = audioTrack;
    
    await client.publish([audioTrack, videoTrack]);
    
    // Setup local video container with proper translation UI
    const localContainer = $(`
      <div id="video-wrapper-${options.uid}" class="video-wrapper">
        <div class="language-selector">
          <select id="translation-lang-${options.uid}" 
                  class="bg-gray-800 rounded px-2 py-1 text-sm" 
                  onchange="updateTranslationView('${options.uid}')">
          </select>
        </div>
        <div class="video-container">
          <div id="local-player" class="w-full h-full"></div>
          <div class="transcription-overlay">
            <div id="transcriptioncaps-${options.uid}" class="text-xl mb-2"></div>
            <div id="translationcaps-${options.uid}" class="text-gray-300"></div>
          </div>
        </div>
      </div>
    `);

    // Replace existing local player
    $("#local-player").parent().parent().replaceWith(localContainer);
    videoTrack.play("local-player");
    
    // Initialize language selector for local user
    updateLanguageSelector(options.uid);
    
    updateButtonStates('joined');
    //in case RTT was started first, adjust Start RTT and Stop RTT buttons states
    if (taskId) {
      $("#start-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").removeClass('hidden');
    }
    showPopup("Joined channel successfully");
  } catch (error) {
    console.error(error);
    showPopup("Failed to join channel: " + error.message);
  }
});

// Update leave handler
$("#leave").click(async function() {
  try {
    // Clear all timeouts including local user
    overlayTimeouts.forEach((timeout, uid) => {
      clearTimeout(timeout);
    });
    overlayTimeouts.clear();
    
    // Hide all overlays
    $(`.transcription-overlay`).addClass('hidden');
    
    if (localTrack) {
      localTrack.stop();
      localTrack.close();
    }
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.close();
    }
    await client.leave();
    $("#local-player").empty();
    $("#remote-playerlist").empty();
    
    updateButtonStates('initial');
    //account for RTT task still running after leaving
    if (taskId) {
      $("#start-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
    }
    showPopup("Left channel successfully");
  } catch (error) {
    console.error(error);
    showPopup("Failed to leave channel");
  }
});

// Update the start-trans click handler
$("#start-trans").click(async function() {
  try {
    if (!$("#key").val() || !$("#secret").val()) {
      showPopup("Please configure STT settings first");
      document.getElementById('sttModal').showModal();
      return;
    }

    if (!options.appid || !options.channel) {
      showPopup("Please configure connection settings first");
      document.getElementById('connectionModal').showModal();
      return;
    }

    $("#start-trans").prop('disabled', true);
    await startTranscription();
    showPopup("Started transcription");
  } catch (error) {
    console.error(error);
    showPopup(error.message || "Failed to start transcription");
    $("#start-trans").prop('disabled', false);
  }
});

// Update the stop-trans click handler
$("#stop-trans").click(async function() {
  try {
    $("#stop-trans").prop('disabled', true);
    await stopTranscription();
    $("#start-trans").prop('disabled', false);
    showPopup("Stopped transcription");
  } catch (error) {
    console.error(error);
    showPopup("Failed to stop transcription");
    $("#stop-trans").prop('disabled', false);
  }
});

