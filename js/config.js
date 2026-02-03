// Configuration and settings management

// Initialize variables
var client;
var options = {
  appid: null,
  channel: null,
  uid: null,
  token: null
};

let transcribeIndex = 0;
let translateIndex = 0;
let localTrack = null;
var localAudioTrack = null;

// Add these variables
let taskId = '';
let tokenName = '';
const gatewayAddress = "https://api.agora.io";
let sttVersion = "7.x"; // Default to 7.x
let translationEnabled = false; // Track translation state

// Keep track of available languages for each user
const userLanguages = new Map(); // uid -> { speaking: string, translations: Set<string> }

// Add timeout tracking variables
const overlayTimeouts = new Map(); // uid -> timeout
const OVERLAY_HIDE_DELAY = 5000; // 5 seconds

// Transcript history (final segments only) for the transcripts modal
let transcriptHistory = [];

// Speaking (transcription) language codes sent in start request; used to map msg.lang (int32) to code per segment
let currentSpeakingLanguages = [];

function clearTranscriptHistory() {
  transcriptHistory = [];
}

// Speaking languages from DOM or saved settings; works on any tab (even if it did not start RTT)
function getSpeakingLanguagesConfig() {
  if (currentSpeakingLanguages && currentSpeakingLanguages.length > 0) return currentSpeakingLanguages;
  try {
    var inputs = document.querySelectorAll('#speaking-languages input');
    var list = [];
    if (inputs && inputs.length) {
      inputs.forEach(function (input) {
        var v = (input.value || '').trim();
        if (v) list.push(v);
      });
    }
    if (list.length > 0) return list;
    var saved = JSON.parse(localStorage.getItem('sttSettings') || '{}');
    return (saved.speakingLanguages || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// Store translation settings
let translationSettings = {
  pairs: []
};

// Host broadcasts transcription + translation languages over data stream so joiners can build transcript UI
let broadcastedSupportedLanguages = { speaking: [], translationPairs: [] };

function setBroadcastedSupportedLanguages(data) {
  if (data && typeof data === 'object') {
    broadcastedSupportedLanguages = {
      speaking: Array.isArray(data.speaking) ? data.speaking : [],
      translationPairs: Array.isArray(data.translationPairs) ? data.translationPairs : []
    };
  }
}

function stringToUint8Array(str) {
  var result = new Uint8Array(new ArrayBuffer(str.length));
  for (var i = 0; i < str.length; i += 1) result[i] = str.charCodeAt(i);
  return result;
}

function utf8ArrayToString(array) {
  var out = "", i = 0, len = array.length, c, char2, char3;
  if (!(array instanceof Uint8Array)) array = new Uint8Array(array);
  while (i < len) {
    c = array[i++];
    switch (c >> 4) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(((c & 0x0F) << 12) | ((char2 & 0x3F) << 6) | (char3 & 0x3F));
        break;
    }
  }
  return out;
}

// Initialize AgoraRTC client
if (!client) {
  client = AgoraRTC.createClient({
    mode: "live",
    codec: "vp8",
    role: "host"
  });
}

// Load saved settings on page load
function loadSavedSettings() {
  // Load connection settings
  const savedConnection = JSON.parse(localStorage.getItem('connectionSettings') || '{}');
  if (savedConnection.appid) {
    $("#appid").val(savedConnection.appid);
    options.appid = savedConnection.appid;
  }
  if (savedConnection.channel) {
    $("#channel").val(savedConnection.channel);
    options.channel = savedConnection.channel;
  }
  if (savedConnection.uid !== undefined) {
    $("#uid").val(savedConnection.uid);
  }
  if (savedConnection.uidString) {
    $("#uid-string").prop('checked', true);
  } else {
    $("#uid-string").prop('checked', false);
  }

  // Load STT settings
  const savedSTT = JSON.parse(localStorage.getItem('sttSettings') || '{}');
  if (savedSTT.key) $("#key").val(savedSTT.key);
  if (savedSTT.secret) $("#secret").val(savedSTT.secret);
  if (savedSTT.version) {
    $("#stt-version").val(savedSTT.version);
    sttVersion = savedSTT.version;
  }
  if (savedSTT.maxIdleTime) $("#max-idle-time").val(savedSTT.maxIdleTime);
  if (savedSTT.speakingLanguage) $("#speaking-language").val(savedSTT.speakingLanguage);
  if (savedSTT.translationLanguage) $("#translation-language").val(savedSTT.translationLanguage);
}

// Save settings functions
function saveConnectionSettings() {
  options.appid = $("#appid").val();
    options.channel = $("#channel").val();
  const uidVal = $("#uid").val();
  const uidString = $("#uid-string").is(":checked");
  options.uid = uidVal !== '' ? (uidString ? uidVal : parseInt(uidVal, 10)) : null;
  
  // Save to localStorage
  localStorage.setItem('connectionSettings', JSON.stringify({
    appid: options.appid,
    channel: options.channel,
    uid: uidVal,
    uidString: uidString
  }));
  
  document.getElementById('connectionModal').close();
  showPopup("Connection settings saved");
}

function saveSTTSettings() {
  const speakingLanguages = Array.from(document.querySelectorAll('#speaking-languages input'))
    .map(input => input.value)
    .filter(value => value.trim() !== '');

  localStorage.setItem('sttSettings', JSON.stringify({
    key: $("#key").val(),
    secret: $("#secret").val(),
    speakingLanguages: speakingLanguages,
    version: $("#stt-version").val(),
    maxIdleTime: $("#max-idle-time").val()
  }));
  
  document.getElementById('sttModal').close();
  showPopup("STT settings saved");
}

// Get authorization
function GetAuthorization() {
  const customerKey = $("#key").val();
  const customerSecret = $("#secret").val();
  if (!customerKey || !customerSecret) {
    showPopup("Please configure STT settings first");
    return "";
  }
  return `Basic ${btoa(`${customerKey}:${customerSecret}`)}`;
}

// Acquire token
async function acquireToken() {
  if (sttVersion === "7.x") {
    // For 7.x, we don't need to acquire token separately
    return { tokenName: null };
  }

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
    return res;
  } else {
    throw new Error(`Failed to acquire token: ${res.status}`);
  }
}

