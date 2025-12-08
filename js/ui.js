// UI updates, popups, button states, and overlay management

// Update button state management
function updateButtonStates(state) {
  switch(state) {
    case 'initial':
      $("#join").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#leave").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#start-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
      break;
    case 'joined':
      $("#join").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#leave").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#start-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
      break;
    case 'transcribing':
      $("#start-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      // Always show translation controls when transcribing, regardless of translation state
      $("#translation-controls").removeClass('hidden');
      $("#enable-translation").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#disable-translation").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      break;
  }
}

// Show popup notification
var popups = 0;

function showPopup(message) {
  const newPopup = popups + 1;
  console.log(`Popup count: ${newPopup}`);
  const y = $(`<div id="popup-${newPopup}" class="popupHidden">${message}</div>`);
  $("#popup-section").append(y);
  const x = document.getElementById(`popup-${newPopup}`);
  x.className = "popupShow";
  const z = popups * 10;
  $(`#popup-${newPopup}`).css("left", `${50 + z}%`);
  popups++;
  setTimeout(function() {
    $(`#popup-${newPopup}`).remove();
    popups--;
  }, 3000);
}

// Add functions to manage overlay visibility
function showOverlay(uid) {
  // Clear existing timeout if any
  if (overlayTimeouts.has(uid)) {
    clearTimeout(overlayTimeouts.get(uid));
  }
  
  // Show overlay for either local or remote user
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
    // Local user
    $(`.video-container .transcription-overlay`).addClass('hidden');
  } else {
    // Remote user
    $(`#video-wrapper-${uid} .transcription-overlay`).addClass('hidden');
  }
  overlayTimeouts.delete(uid);
}

// Show inline alert in STT modal
function showSTTModalAlert(message) {
  const alertDiv = document.getElementById('stt-modal-alert');
  alertDiv.textContent = message;
  alertDiv.classList.remove('hidden');
  // Scroll modal to top so alert is visible
  const sttModal = document.getElementById('sttModal');
  if (sttModal && typeof sttModal.scrollTo === 'function') {
    sttModal.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (sttModal) {
    sttModal.scrollTop = 0;
  }
  setTimeout(() => {
    alertDiv.classList.add('hidden');
  }, 3000);
}

// Function to preview the start request
function previewStartRequest() {
  try {
    const body = buildStartRequestBody();
    const requestBodyElement = document.getElementById('request-body');
    const previewDiv = document.getElementById('request-preview');
    
    // Format the JSON with proper indentation
    const formattedJson = JSON.stringify(body, null, 2);
    requestBodyElement.textContent = formattedJson;
    
    // Show the preview
    previewDiv.classList.remove('hidden');
    
    // Scroll to the preview section
    const sttModal = document.getElementById('sttModal');
    if (sttModal && typeof sttModal.scrollTo === 'function') {
      sttModal.scrollTo({ top: sttModal.scrollHeight, behavior: 'smooth' });
    }
    
  } catch (error) {
    console.error('Error building request preview:', error);
    showSTTModalAlert('Error building request preview: ' + error.message);
  }
}

// Function to copy request to clipboard
async function copyRequestToClipboard() {
  try {
    const requestBodyElement = document.getElementById('request-body');
    const text = requestBodyElement.textContent;
    
    if (navigator.clipboard && window.isSecureContext) {
      // Use the modern clipboard API
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    
    showPopup('Request body copied to clipboard!');
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    showPopup('Failed to copy to clipboard: ' + error.message);
  }
}

