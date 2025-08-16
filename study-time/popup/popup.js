// popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const redirectPlaylistInput = document.getElementById('redirectPlaylist');
  const summaryMethodSelect = document.getElementById('summaryMethod');
  const saveButton = document.getElementById('saveBtn');
  const clearButton = document.getElementById('clearBtn');
  const methodInfo = document.getElementById('methodInfo');

  // Load saved settings
  chrome.storage.sync.get(['geminiApiKey', 'redirectPlaylistUrl', 'summaryMethod'], (items) => {
    if (items.geminiApiKey) apiKeyInput.value = items.geminiApiKey;
    if (items.redirectPlaylistUrl) redirectPlaylistInput.value = items.redirectPlaylistUrl;
    if (items.summaryMethod) summaryMethodSelect.value = items.summaryMethod;
  });

  // Save settings
  saveButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const redirectPlaylistUrl = redirectPlaylistInput.value.trim();
    const summaryMethod = summaryMethodSelect.value;

    chrome.storage.sync.set({
      geminiApiKey: apiKey,
      redirectPlaylistUrl: redirectPlaylistUrl,
      summaryMethod: summaryMethod
    }, () => {
      console.log('Settings saved:', { apiKey, redirectPlaylistUrl, summaryMethod });
      alert('Settings saved successfully!');
    });
  });

  // Clear API key
  clearButton.addEventListener('click', () => {
    chrome.storage.sync.remove(['geminiApiKey'], () => {
      apiKeyInput.value = '';
      console.log('API key cleared');
      alert('API key cleared!');
    });
  });

  // Update method info based on selection
  summaryMethodSelect.addEventListener('change', () => {
    methodInfo.textContent = summaryMethodSelect.value === 'gemini'
      ? 'Uses your Gemini API key to generate summaries directly in the extension.'
      : 'Redirects to ChatGPT with the transcript and a default prompt.';
  });
});