// UI updates, popups, button states, and overlay management

// Update button state management
function updateButtonStates(state) {
  switch(state) {
    case 'initial':
      $("#join").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#leave").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#start-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#view-transcripts").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
      break;
    case 'joined':
      $("#join").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#leave").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#start-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#view-transcripts").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#translation-controls").addClass('hidden');
      break;
    case 'transcribing':
      $("#start-trans").prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
      $("#stop-trans").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
      $("#view-transcripts").prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
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

// Languages that actually appeared in the stream (transcript history only) – not from page config
function getTranscriptLanguagesFromData() {
  var allLangs = {};
  transcriptHistory.forEach(function (seg) {
    if (seg.sourceLang) allLangs[seg.sourceLang] = true;
    Object.keys(seg.translations || {}).forEach(function (lang) { allLangs[lang] = true; });
  });
  return Object.keys(allLangs).sort();
}

function getTranscriptTabLanguages() {
  var allLangs = {};
  getTranscriptLanguagesFromData().forEach(function (lang) { allLangs[lang] = true; });
  (broadcastedSupportedLanguages.speaking || []).forEach(function (lang) { if (lang) allLangs[lang] = true; });
  (broadcastedSupportedLanguages.translationPairs || []).forEach(function (p) {
    if (p.source) allLangs[p.source] = true;
    (p.targets || []).forEach(function (t) { if (t) allLangs[t] = true; });
  });
  return Object.keys(allLangs).sort();
}

// Tab options: By segment, Transcript (all original speech), then one tab per language, then Word cloud
function getTranscriptTabOptions() {
  var list = [{ value: 'segment', label: 'By segment' }];
  var hasAnyTranscript = transcriptHistory.some(function (seg) { return seg.transcriptText; });
  if (hasAnyTranscript) list.push({ value: 'transcript', label: 'Transcript' });
  getTranscriptTabLanguages().forEach(function (lang) {
    list.push({ value: lang, label: lang });
  });
  list.push({ value: 'wordcloud', label: 'Word cloud' });
  return list;
}

// Stop words to exclude from word cloud (common articles, pronouns, prepositions, etc.)
var wordCloudStopWords = {
  a: true, an: true, the: true, and: true, or: true, but: true, if: true, of: true, in: true, on: true, at: true, to: true, for: true, with: true, by: true, from: true, as: true, is: true, are: true, was: true, were: true, be: true, been: true, being: true, have: true, has: true, had: true, do: true, does: true, did: true, will: true, would: true, could: true, should: true, may: true, might: true, must: true, shall: true, can: true, this: true, that: true, these: true, those: true, it: true, its: true, i: true, you: true, he: true, she: true, we: true, they: true, me: true, him: true, her: true, us: true, them: true, my: true, your: true, his: true, our: true, their: true,
  el: true, la: true, los: true, las: true, un: true, una: true, unos: true, unas: true, y: true, o: true, pero: true, si: true, de: true, del: true, en: true, al: true, a: true, por: true, para: true, con: true, sin: true, sobre: true, entre: true, hasta: true, desde: true, que: true, es: true, son: true, era: true, fueron: true, ser: true, estar: true, tiene: true, tener: true, hay: true, este: true, esta: true, estos: true, estas: true, ese: true, esa: true, eso: true, aquel: true, aquella: true, lo: true, le: true, se: true, te: true, nos: true, les: true, mi: true, tu: true, su: true, mis: true, tus: true, sus: true,
  le: true, les: true, du: true, des: true, une: true, et: true, ou: true, mais: true, si: true, dans: true, sur: true, pour: true, avec: true, ce: true, cet: true, cette: true, ces: true, il: true, elle: true, on: true, nous: true, vous: true, ils: true, elles: true, der: true, die: true, das: true, und: true, oder: true, aber: true, in: true, von: true, zu: true, bei: true, mit: true
};

// All words from transcript + all translations, lowercased, with counts (for word cloud); stop words excluded
function getWordCloudData() {
  var count = {};
  function addText(text) {
    if (!text || typeof text !== 'string') return;
    var words = text.toLowerCase().split(/\s+/).map(function (w) { return w.replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF'-]/gi, ''); }).filter(function (w) { return w.length > 0; });
    words.forEach(function (w) {
      if (!wordCloudStopWords[w]) count[w] = (count[w] || 0) + 1;
    });
  }
  transcriptHistory.forEach(function (seg) {
    addText(seg.transcriptText);
    var t = seg.translations || {};
    Object.keys(t).forEach(function (lang) { addText(t[lang]); });
  });
  var arr = Object.keys(count).map(function (word) { return { word: word, count: count[word] }; });
  arr.sort(function (a, b) { return b.count - a.count; });
  return arr;
}

// Word cloud data with language: one row per (word, language), for CSV export
function getWordCloudDataByLanguage() {
  var count = {};
  function addText(text, lang) {
    if (!text || typeof text !== 'string' || !lang) return;
    var words = text.toLowerCase().split(/\s+/).map(function (w) { return w.replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF'-]/gi, ''); }).filter(function (w) { return w.length > 0; });
    words.forEach(function (w) {
      if (!wordCloudStopWords[w]) {
        var key = w + '\0' + lang;
        count[key] = (count[key] || 0) + 1;
      }
    });
  }
  transcriptHistory.forEach(function (seg) {
    if (seg.sourceLang && seg.transcriptText) addText(seg.transcriptText, seg.sourceLang);
    var t = seg.translations || {};
    Object.keys(t).forEach(function (lang) { addText(t[lang], lang); });
  });
  var arr = Object.keys(count).map(function (key) {
    var i = key.indexOf('\0');
    return { word: key.slice(0, i), language: key.slice(i + 1), count: count[key] };
  });
  arr.sort(function (a, b) { return b.count - a.count || a.word.localeCompare(b.word) || a.language.localeCompare(b.language); });
  return arr;
}

function getTranscriptSelectedLang() {
  var tab = document.querySelector('#transcripts-lang-tabs [data-transcript-tab].transcript-tab-active');
  return tab ? tab.getAttribute('data-transcript-tab') : 'segment';
}

// Build plain text from transcript history (for copy and export) for the currently selected tab
function getTranscriptsAsText(selectedLang) {
  if (selectedLang == null) selectedLang = getTranscriptSelectedLang();
  if (selectedLang === 'segment') {
    var lines = [];
    transcriptHistory.forEach(function (seg) {
      lines.push('[' + seg.time + '] User ' + seg.uid + ':');
      if (seg.transcriptText) lines.push('  ' + seg.transcriptText);
      Object.keys(seg.translations || {}).forEach(function (lang) {
        lines.push('  [' + lang + '] ' + seg.translations[lang]);
      });
      if (!seg.transcriptText && !Object.keys(seg.translations || {}).length) lines.push('  (empty)');
      lines.push('');
    });
    return lines.join('\n').trim() || 'No final transcripts yet.';
  }
  if (selectedLang === 'transcript') {
    var out = [];
    transcriptHistory.forEach(function (seg) {
      if (seg.transcriptText) out.push('[' + seg.time + '] User ' + seg.uid + ': ' + seg.transcriptText);
    });
    return out.length ? out.join('\n') : 'No final transcripts yet.';
  }
  if (selectedLang === 'wordcloud') return 'Word cloud – click a word to copy it.';
  var langLines = [];
  transcriptHistory.forEach(function (seg) {
    var text = (seg.sourceLang === selectedLang && seg.transcriptText) ? seg.transcriptText : (seg.translations || {})[selectedLang];
    if (text) langLines.push('[' + seg.time + '] User ' + seg.uid + ': ' + text);
  });
  return langLines.length ? langLines.join('\n') : 'No final transcripts yet.';
}

// Render modal: build language tabs, then content for selected tab
function renderTranscriptsModalContent() {
  var container = document.getElementById('transcripts-modal-content');
  var emptyEl = document.getElementById('transcripts-empty');
  var tabsContainer = document.getElementById('transcripts-lang-tabs');
  if (!container || !tabsContainer) return;

  container.querySelectorAll('.transcript-segment').forEach(function (el) { el.remove(); });
  container.querySelectorAll('.transcript-script-section').forEach(function (el) { el.remove(); });
  container.querySelectorAll('.transcript-wordcloud').forEach(function (el) { el.remove(); });

  if (!transcriptHistory.length) {
    emptyEl.classList.remove('hidden');
    tabsContainer.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  var options = getTranscriptTabOptions();
  var current = getTranscriptSelectedLang();
  var currentExists = options.some(function (o) { return o.value === current; });
  if (!currentExists) current = options[0].value;

  var selectedBeforeRebuild = current;
  tabsContainer.innerHTML = '';
  options.forEach(function (opt, i) {
    var isActive = opt.value === selectedBeforeRebuild || (i === 0 && !currentExists);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-3 py-2 text-sm text-white border-r border-slate-600/50 last:border-r-0 ' + (isActive ? 'transcript-tab-active bg-cyan-600/80' : 'bg-slate-700/80 hover:bg-slate-600/80');
    btn.setAttribute('data-transcript-tab', opt.value);
    btn.textContent = opt.label;
    btn.onclick = function () {
      tabsContainer.querySelectorAll('[data-transcript-tab]').forEach(function (b) {
        b.classList.remove('transcript-tab-active', 'bg-cyan-600/80');
        b.classList.add('bg-slate-700/80');
      });
      btn.classList.remove('bg-slate-700/80');
      btn.classList.add('transcript-tab-active', 'bg-cyan-600/80');
      renderTranscriptsModalContent();
    };
    tabsContainer.appendChild(btn);
  });

  if (selectedBeforeRebuild === 'segment') {
    transcriptHistory.forEach(function (seg) {
      var segEl = document.createElement('div');
      segEl.className = 'transcript-segment rounded-lg border border-slate-600/50 bg-slate-800/80 p-3';
      var html = '<div class="flex items-center gap-2 text-slate-300 text-sm mb-1">';
      html += '<span class="font-medium">User ' + escapeHtml(String(seg.uid)) + '</span>';
      html += '<span class="text-slate-500">' + escapeHtml(seg.time) + '</span>';
      html += '</div>';
      if (seg.transcriptText) html += '<p class="text-white mb-2">' + escapeHtml(seg.transcriptText) + '</p>';
      var trans = seg.translations || {};
      var langs = Object.keys(trans);
      if (langs.length) {
        html += '<div class="space-y-1 pl-2 border-l-2 border-slate-600">';
        langs.forEach(function (lang) {
          html += '<p class="text-slate-300 text-sm"><span class="text-cyan-400">' + escapeHtml(lang) + ':</span> ' + escapeHtml(trans[lang]) + '</p>';
        });
        html += '</div>';
      }
      if (!seg.transcriptText && !langs.length) html += '<p class="text-slate-500 text-sm">(empty)</p>';
      segEl.innerHTML = html;
      container.appendChild(segEl);
    });
  } else   if (selectedBeforeRebuild === 'transcript') {
    var sectionEl = document.createElement('div');
    sectionEl.className = 'transcript-script-section';
    var html = '<div class="space-y-1">';
    transcriptHistory.forEach(function (seg) {
      if (seg.transcriptText) html += '<p class="text-slate-300 text-sm">[' + escapeHtml(seg.time) + '] User ' + escapeHtml(String(seg.uid)) + ': ' + escapeHtml(seg.transcriptText) + '</p>';
    });
    html += '</div>';
    sectionEl.innerHTML = html;
    container.appendChild(sectionEl);
  } else if (selectedBeforeRebuild === 'wordcloud') {
    var cloudData = getWordCloudData();
    var cloudEl = document.createElement('div');
    cloudEl.className = 'transcript-wordcloud';
    if (cloudData.length === 0) {
      cloudEl.innerHTML = '<p class="text-slate-500 text-sm">No words yet. Transcripts appear here after segments are finalized.</p>';
    } else {
      var hintRow = document.createElement('div');
      hintRow.className = 'flex items-center justify-between gap-2 mb-3 flex-wrap';
      var hint = document.createElement('p');
      hint.className = 'text-slate-400 text-xs';
      hint.textContent = 'Hover to see how many times a word appears; click to copy it.';
      hintRow.appendChild(hint);
      var exportCsvBtn = document.createElement('button');
      exportCsvBtn.type = 'button';
      exportCsvBtn.className = 'modern-btn modern-btn-secondary text-xs py-1.5 px-2';
      exportCsvBtn.textContent = 'Export CSV';
      exportCsvBtn.onclick = exportWordCloudAsCsv;
      hintRow.appendChild(exportCsvBtn);
      cloudEl.appendChild(hintRow);
      var cloudShape = document.createElement('div');
      cloudShape.className = 'word-cloud-shape';
      var minCount = cloudData[cloudData.length - 1].count;
      var maxCount = cloudData[0].count;
      var range = Math.max(maxCount - minCount, 1);
      var n = cloudData.length;
      var positions = [];
      var step = Math.max(5, Math.min(12, Math.floor(90 / Math.sqrt(n))));
      for (var gx = 6; gx <= 94; gx += step) {
        for (var gy = 10; gy <= 90; gy += step) {
          var dx = (gx - 50) / 42;
          var dy = (gy - 50) / 38;
          if (dx * dx + dy * dy <= 1) positions.push({ left: gx + (Math.random() - 0.5) * (step * 0.4), top: gy + (Math.random() - 0.5) * (step * 0.4) });
        }
      }
      while (positions.length < n) {
        var t = Math.random() * Math.PI * 2;
        var r = 0.2 + 0.75 * Math.random();
        positions.push({ left: 50 + 40 * r * Math.cos(t) + (Math.random() - 0.5) * 3, top: 50 + 36 * r * Math.sin(t) + (Math.random() - 0.5) * 3 });
      }
      for (var pi = positions.length - 1; pi > 0; pi--) {
        var pj = Math.floor(Math.random() * (pi + 1));
        var tmp = positions[pi];
        positions[pi] = positions[pj];
        positions[pj] = tmp;
      }
      var shuffled = cloudData.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      shuffled.forEach(function (item, idx) {
        var pos = positions[idx] || { left: 50, top: 50 };
        var size = 12 + Math.round(((item.count - minCount) / range) * 18);
        var span = document.createElement('span');
        span.className = 'word-cloud-word';
        span.style.fontSize = size + 'px';
        span.style.left = pos.left + '%';
        span.style.top = pos.top + '%';
        span.textContent = item.word;
        span.setAttribute('data-tooltip', item.count + (item.count === 1 ? ' time' : ' times'));
        span.onclick = (function (word) {
          return function () {
            if (navigator.clipboard && window.isSecureContext) {
              navigator.clipboard.writeText(word);
            } else {
              var ta = document.createElement('textarea');
              ta.value = word;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            if (typeof showPopup === 'function') showPopup('Copied: ' + word);
          };
        })(item.word);
        cloudShape.appendChild(span);
      });
      cloudEl.appendChild(cloudShape);
    }
    container.appendChild(cloudEl);
  } else {
    var sectionEl = document.createElement('div');
    sectionEl.className = 'transcript-script-section';
    var html = '<div class="space-y-1">';
    transcriptHistory.forEach(function (seg) {
      var text = (seg.sourceLang === selectedBeforeRebuild && seg.transcriptText) ? seg.transcriptText : (seg.translations || {})[selectedBeforeRebuild];
      if (text) html += '<p class="text-slate-300 text-sm">[' + escapeHtml(seg.time) + '] User ' + escapeHtml(String(seg.uid)) + ': ' + escapeHtml(text) + '</p>';
    });
    html += '</div>';
    sectionEl.innerHTML = html;
    container.appendChild(sectionEl);
  }
}

// Open transcripts modal and render content
function openTranscriptsModal() {
  renderTranscriptsModalContent();
  document.getElementById('transcriptsModal').showModal();
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// Copy transcripts to clipboard
async function copyTranscriptsToClipboard() {
  try {
    const text = getTranscriptsAsText();
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    showPopup('Transcripts copied to clipboard');
  } catch (err) {
    console.error(err);
    showPopup('Failed to copy: ' + (err.message || 'unknown error'));
  }
}

// Export transcripts as downloadable .txt file
function exportTranscriptsAsTxt() {
  const text = getTranscriptsAsText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcripts-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showPopup('Transcripts exported as TXT');
}

// Export word cloud as CSV: word (column 1), language (column 2), count (column 3)
function exportWordCloudAsCsv() {
  var data = getWordCloudDataByLanguage();
  if (!data.length) {
    showPopup('No word cloud data to export.');
    return;
  }
  function csvEscape(s) {
    s = String(s);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var header = 'word,language,count';
  var rows = data.map(function (item) {
    return csvEscape(item.word) + ',' + csvEscape(item.language) + ',' + item.count;
  });
  var csv = header + '\n' + rows.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'word-cloud-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showPopup('Word cloud exported as CSV');
}

