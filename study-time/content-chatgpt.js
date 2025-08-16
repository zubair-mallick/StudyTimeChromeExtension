// content-chatgpt.js
async function submitToChatGPT(prompt, transcript) {
  console.log('Starting ChatGPT submission...');
  
  const textarea = document.querySelector('#prompt-textarea');
  if (!textarea) {
    throw new Error('ChatGPT textarea not found');
  }

  // Clear any previous content
  textarea.value = '';
  
  // Add our content
  const p = document.createElement('p');
  p.textContent = `${prompt}\n\n${transcript}`;
  p.style.whiteSpace = 'pre-wrap';
  p.style.padding = '8px';
  p.style.marginBottom = '12px';
  p.style.borderBottom = '1px solid #e5e7eb';
  textarea.prepend(p);
  
  // Submit logic with retries
  const maxAttempts = 5;
  const checkInterval = 300;
  
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const trySubmit = () => {
      attempts++;
      const sendButton = document.querySelector('[data-testid="send-button"]');
      
      if (!sendButton) {
        if (attempts >= maxAttempts) return reject('Send button not found');
        return setTimeout(trySubmit, checkInterval);
      }
      
      if (sendButton.disabled) {
        textarea.focus();
        if (attempts >= maxAttempts) return reject('Send button stayed disabled');
        return setTimeout(trySubmit, checkInterval);
      }
      
      sendButton.click();
      resolve();
    };
    
    textarea.focus();
    trySubmit();
  });
}

// Handle messages from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'inject_chatgpt_prompt') {
    submitToChatGPT(msg.payload.prompt, msg.payload.transcript)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err }));
    return true; // Keep port open
  }
});