// Settings UI management functions

// Update speaking languages input
function addLanguageInput(containerId) {
  const container = document.getElementById(containerId);
  const maxLanguages = sttVersion === "7.x" ? 4 : 2;
  const currentInputs = Array.from(container.querySelectorAll('input')).map(input => input.value);
  if (currentInputs.length >= maxLanguages) {
    showPopup(`Maximum ${maxLanguages} speaking languages allowed for ${sttVersion}`);
    return;
  }
  currentInputs.push("");
  renderSpeakingLanguagesInputs(currentInputs, maxLanguages);
}

function addTargetLanguage(btn) {
  const container = btn.parentElement;
  if (container.children.length >= 6) { // Max 5 target languages + button
    showPopup("Maximum 5 target languages allowed per source");
    return;
  }
  
  const div = document.createElement('div');
  div.className = 'flex gap-2';
  div.innerHTML = `
    <input type="text" class="flex-1 bg-gray-800 rounded p-2" placeholder="Target language">
    <button onclick="this.parentElement.remove()" class="bg-red-600 px-3 rounded">-</button>
  `;
  // Insert before the "Add Target Language" button
  btn.parentNode.insertBefore(div, btn);
}

function addTranslationPair() {
  const container = document.getElementById('translation-pairs');
  const maxPairs = sttVersion === "7.x" ? 4 : 2;
  
  if (container.children.length >= maxPairs) {
    showSTTModalAlert(`Maximum ${maxPairs} source languages allowed for ${sttVersion}`);
    return;
  }
  
  const div = document.createElement('div');
  div.className = 'translation-pair border border-gray-700 p-4 rounded';
  div.innerHTML = `
    <div class="mb-4">
      <div class="flex justify-between items-center mb-2">
        <label class="block">Source Language</label>
        <button onclick="this.closest('.translation-pair').remove(); saveTranslationSettings();" class="text-red-500 text-sm">Remove Pair</button>
      </div>
      <input type="text" class="source-lang w-full bg-gray-800 rounded p-2" placeholder="e.g., en-US">
    </div>
    <div class="target-languages space-y-2">
      <label class="block mb-2">Target Languages</label>
      <button onclick="addTargetLanguage(this)" class="bg-blue-600 px-3 py-2 rounded w-full">Add Target Language</button>
    </div>
  `;
  container.appendChild(div);
  saveTranslationSettings();
}

// Function to save translation settings
function saveTranslationSettings() {
  translationSettings.pairs = Array.from(document.querySelectorAll('.translation-pair')).map(pair => ({
    source: pair.querySelector('.source-lang').value,
    targets: Array.from(pair.querySelectorAll('.target-languages input'))
      .map(input => input.value)
      .filter(value => value.trim() !== '')
  })).filter(pair => pair.source && pair.targets.length > 0);

  localStorage.setItem('translationSettings', JSON.stringify(translationSettings));
  updateAllLanguageSelectors();
}

// Function to load translation settings
function loadTranslationSettings() {
  // Load speaking languages
  const savedSTT = JSON.parse(localStorage.getItem('sttSettings') || '{}');
  const maxLanguages = sttVersion === "7.x" ? 4 : 2;
  let languages = ["en-US"];
  if (savedSTT.speakingLanguages) {
    languages = savedSTT.speakingLanguages.slice(0, maxLanguages);
  }
  renderSpeakingLanguagesInputs(languages, maxLanguages);

  // Load translation settings
  const saved = localStorage.getItem('translationSettings');
  const container = document.getElementById('translation-pairs');
  
  // Only clear if we're actually loading settings (not just checking)
  if (saved) {
    container.innerHTML = ''; // Clear existing
    console.log("Loading translation settings from localStorage");
  }

  if (saved) {
    translationSettings = JSON.parse(saved);
    const maxPairs = sttVersion === "7.x" ? 4 : 2;
    const pairs = translationSettings.pairs.slice(0, maxPairs);
    
    pairs.forEach(pair => {
      const div = document.createElement('div');
      div.className = 'translation-pair border border-gray-700 p-4 rounded';
      div.innerHTML = `
        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <label class="block">Source Language</label>
            <button onclick="this.closest('.translation-pair').remove()" class="text-red-500 text-sm">Remove Pair</button>
          </div>
          <input type="text" class="source-lang w-full bg-gray-800 rounded p-2" value="${pair.source}">
        </div>
        <div class="target-languages space-y-2">
          <label class="block mb-2">Target Languages</label>
          ${pair.targets.map(target => `
            <div class="flex gap-2">
              <input type="text" class="flex-1 bg-gray-800 rounded p-2" value="${target}">
              <button onclick="this.parentElement.remove()" class="bg-red-600 px-3 rounded">-</button>
            </div>
          `).join('')}
          <button onclick="addTargetLanguage(this)" class="bg-blue-600 px-3 py-2 rounded w-full">Add Target Language</button>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // Only create empty pair if there are no pairs at all
  if (container.children.length === 0) {
    addTranslationPair();
  }

  updateAllLanguageSelectors();
}

// Add version handling functions
function handleVersionChange() {
  sttVersion = $("#stt-version").val();
  const maxLanguages = sttVersion === "7.x" ? 4 : 2;
  
  // Update max languages display
  $("#max-speaking-languages").text(maxLanguages);
  
  // Get current values
  const container = document.getElementById('speaking-languages');
  const currentInputs = Array.from(container.querySelectorAll('input')).map(input => input.value);
  const languages = currentInputs.slice(0, maxLanguages);
  renderSpeakingLanguagesInputs(languages, maxLanguages);

  // Update translation pairs container
  const pairsContainer = document.getElementById('translation-pairs');
  if (sttVersion === "7.x" && pairsContainer.children.length > 4) {
    while (pairsContainer.children.length > 4) {
      pairsContainer.lastChild.remove();
    }
  }

  // Handle Sub Bot fields for 7.x
  const subBotUidField = $("#puller-uid");
  const subBotTokenField = $("#puller-token");
  const subBotNote = $("#sub-bot-note");
  const subBotTokenNote = $("#sub-bot-token-note");
  
  // REVERTED: Both fields are always enabled and editable
  subBotUidField.prop('disabled', false);
  subBotTokenField.prop('disabled', false);
  subBotNote.hide();
  subBotTokenNote.hide();
}

function renderSpeakingLanguagesInputs(languages, maxLanguages) {
  const container = document.getElementById('speaking-languages');
  container.innerHTML = '';
  languages.forEach(lang => {
    const div = document.createElement('div');
    div.className = 'flex gap-2';
    div.innerHTML = `
      <input type="text" class="flex-1 bg-gray-800 rounded p-2" value="${lang}">
      <button onclick="this.parentElement.remove()" class="bg-red-600 px-3 rounded">-</button>
    `;
    container.appendChild(div);
  });
  // Add the + button row if not at max
  if (languages.length < maxLanguages) {
    const addDiv = document.createElement('div');
    addDiv.className = 'flex gap-2';
    addDiv.innerHTML = `
      <button onclick="addLanguageInput('speaking-languages')" class="bg-blue-600 px-3 rounded w-full">+</button>
    `;
    container.appendChild(addDiv);
  }
}

