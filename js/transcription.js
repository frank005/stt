// Transcription start/stop functions

// Update startTranscription to handle multiple languages
async function startTranscription() {
  const authorization = GetAuthorization();
  if (!authorization) {
    throw new Error("key or secret is empty");
  }

  const data = await acquireToken();
  tokenName = data.tokenName;

  // Build request body using the shared function
  const body = buildStartRequestBody();

  console.log("Starting transcription with body:", body);

  // Determine URL based on version
  let url;
  if (sttVersion === "7.x") {
    url = `${gatewayAddress}/api/speech-to-text/v1/projects/${options.appid}/join`;
  } else {
    url = `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/tasks?builderToken=${tokenName}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": authorization
    },
    body: JSON.stringify(body)
  });

  const responseText = await res.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { message: responseText };
  }

  if (!res.ok) {
    if (res.status === 409 && responseData.taskId) {
      taskId = responseData.taskId;
      updateButtonStates('transcribing');
      return { taskId };
    }
    throw new Error(responseData.message || `HTTP error ${res.status}`);
  }

  // Handle different response formats based on version
  if (sttVersion === "7.x") {
    if (!responseData.agent_id) {
      throw new Error("No agent_id received from server");
    }
    taskId = responseData.agent_id;
    // You might want to handle different status codes here
    if (responseData.status !== "RUNNING") {
      throw new Error(`Unexpected status: ${responseData.status}`);
    }
  } else {
    if (!responseData.taskId) {
      throw new Error("No taskId received from server");
    }
    taskId = responseData.taskId;
  }

  updateButtonStates('transcribing');
  
  // Check if translation was enabled in the initial request
  if (body.translateConfig && body.translateConfig.enable) {
    translationEnabled = true;
  } else {
    translationEnabled = false;
  }
  updateTranslationStatus();
  
  return responseData;
}

// Update stopTranscription to handle button states
async function stopTranscription() {
  if (!taskId) return;
  
  // Determine URL and method based on version
  let url;
  let method;
  if (sttVersion === "7.x") {
    url = `${gatewayAddress}/api/speech-to-text/v1/projects/${options.appid}/agents/${taskId}/leave`;
    method = 'POST';
  } else {
    url = `${gatewayAddress}/v1/projects/${options.appid}/rtsc/speech-to-text/tasks/${taskId}?builderToken=${tokenName}`;
    method = 'DELETE';
  }
  
  await fetch(url, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": GetAuthorization()
    }
  });
  
  taskId = null;
  translationEnabled = false;
  $("#enable-translation").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
  $("#disable-translation").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
  $("#translation-controls").addClass('hidden');
  updateButtonStates('joined');
  
  // Clear all transcriptions captions
  $("[id^=transcriptioncaps-]").text("");
  $("[id^=translationcaps-]").text("");
}

// Function to build the start request body (same logic as startTranscription)
function buildStartRequestBody() {
  // Build request body based on version
  const body = {
    languages: Array.from(document.querySelectorAll('#speaking-languages input'))
      .map(input => input.value)
      .filter(value => value.trim() !== ''),
    maxIdleTime: parseInt($("#max-idle-time").val()) || 60,
    rtcConfig: {
      channelName: options.channel,
      pubBotUid: $("#pusher-uid").val()
    }
  };

  // Include subBotUid and subBotToken
  body.rtcConfig.subBotUid = $("#puller-uid").val();
  const pullToken = $("#puller-token").val();
  if (pullToken) body.rtcConfig.subBotToken = pullToken;

  // Add name field for 7.x
  if (sttVersion === "7.x") {
    body.name = options.channel; // Using channel name as the agent name
  }

  // Add optional pub bot token
  const pushToken = $("#pusher-token").val();
  if (pushToken) body.rtcConfig.pubBotToken = pushToken;

  // Add encryption if specified
  const decryptionMode = $("#decryption-mode").val();
  const secret = $("#encryption-secret").val();
  const salt = $("#encryption-salt").val();
  if (decryptionMode) body.rtcConfig.cryptionMode = parseInt(decryptionMode);
  if (secret) body.rtcConfig.secret = secret;
  if (salt) body.rtcConfig.salt = salt;

  // Add translation config
  const translationPairs = Array.from(document.querySelectorAll('.translation-pair')).map(pair => {
    const source = pair.querySelector('.source-lang').value;
    const targets = Array.from(pair.querySelectorAll('.target-languages input')).map(input => input.value);
    return {
      source,
      target: targets
    };
  }).filter(pair => pair.source && pair.target.length > 0);

  if (translationPairs.length > 0) {
    body.translateConfig = {
      enable: true,
      forceTranslateInterval: 5,
      languages: translationPairs
    };
  }

  // Add optional storage config
  const s3Bucket = $("#s3-bucket").val();
  if (s3Bucket) {
    body.captionConfig = {
      sliceDuration: 60,
      storage: {
        bucket: s3Bucket
      }
    };

    // Add optional storage credentials
    const s3AccessKey = $("#s3-access-key").val();
    const s3SecretKey = $("#s3-secret-key").val();
    if (s3AccessKey && s3SecretKey) {
      body.captionConfig.storage.accessKey = s3AccessKey;
      body.captionConfig.storage.secretKey = s3SecretKey;
    }

    // Add optional storage configuration
    const s3Vendor = $("#s3-vendor").val();
    if (s3Vendor) {
      body.captionConfig.storage.vendor = parseInt(s3Vendor);
    }

    const s3Region = $("#s3-region").val();
    if (s3Region) {
      body.captionConfig.storage.region = parseInt(s3Region);
    }

    const s3FileNamePrefix = $("#s3-fileNamePrefix").val();
    if (s3FileNamePrefix) {
      body.captionConfig.storage.fileNamePrefix = [s3FileNamePrefix];
    }
  }

  return body;
}

// Add helper functions for transcription display
function addTranscribeItem(uid, text) {
  const timestamp = new Date().toLocaleTimeString();
  const itemId = `transcribecaps-${uid}-${transcribeIndex}`;
  
  if ($(`#${itemId}`)[0]) {
    $(`#${itemId} .msg`).html(text);
  } else {
    const $item = $(`
      <div class="item" id="${itemId}">
        <span class="timestamp">[${timestamp}]</span>
        <span class="uid">${uid}</span>:
        <span class="msg">${text}</span>
      </div>
    `);
    $("#stt-transcribe .content").prepend($item);
  }
}

function addTranslateItem(uid, text) {
  const timestamp = new Date().toLocaleTimeString();
  const itemId = `translatecaps-${uid}-${translateIndex}`;
  
  if ($(`#${itemId}`)[0]) {
    $(`#${itemId} .msg`).html(text);
  } else {
    const $item = $(`
      <div class="item" id="${itemId}">
        <span class="timestamp">[${timestamp}]</span>
        <span class="uid">${uid}</span>:
        <span class="msg">${text}</span>
      </div>
    `);
    $("#stt-translate .content").append($item);
  }
}

