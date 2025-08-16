(() => {
  'use strict';

  // Prevent multiple instances
  if (window.studyTimeActive) {
    console.log('🎓 StudyTime: Already active, skipping');
    return;
  }
  window.studyTimeActive = true;

  let currentVideoId = null;
  let isProcessing = false;
  let processingTimeout = null;
  let summaryButton = null;
  let summaryModal = null;

  function log(...args) {
    console.log('🎓 StudyTime:', ...args);
  }

  // Get video ID from current URL
  function getCurrentVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.slice(1).split('?')[0];
      }
      return url.searchParams.get('v');
    } catch (e) {
      return null;
    }
  }

  // Check if we're on a video page
  function isVideoPage() {
    const url = window.location.href;
    return url.includes('/watch?v=') || url.includes('youtu.be/');
  }

  // Extract video title and description from page
  function getVideoData() {
    let title = '';
    let description = '';

    // Get title - try multiple selectors
    const titleSelectors = [
      'h1.ytd-video-primary-info-renderer',
      '.ytd-video-primary-info-renderer h1',
      '.watch-title',
      'h1[class*="title"]'
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // Fallback to page title
    if (!title || title === 'YouTube') {
      title = document.title.replace(' - YouTube', '').trim();
    }

    // Get description
    const descSelectors = [
      '.content.ytd-video-secondary-info-renderer',
      '#description',
      '.watch-description'
    ];

    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim()) {
        description = el.textContent.trim().substring(0, 500);
        break;
      }
    }

    // Fallback to meta description
    if (!description) {
      const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
      if (meta && meta.content) {
        description = meta.content.trim().substring(0, 500);
      }
    }

    return { title: title || `Video ${getCurrentVideoId()}`, description };
  }

  // Create summary button
  function createSummaryButton() {
    if (summaryButton) {
      summaryButton.remove();
    }

    const button = document.createElement('div');
    button.id = 'study-time-summary-btn';
    button.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-family: 'YouTube Sans', sans-serif;
        font-size: 14px;
        font-weight: 500;
        margin: 12px 0;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        border: none;
        display: flex;
        align-items: center;
        gap: 8px;
      " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.3)'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
        📝 Summarize Video
      </div>
    `;

    button.addEventListener('click', handleSummaryClick);
    summaryButton = button;
    return button;
  }

  // Create summary modal
  function createSummaryModal() {
    const modal = document.createElement('div');
    modal.id = 'study-time-summary-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      padding: 20px;
      box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        max-width: 800px;
        max-height: 90vh;
        width: 100%;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      ">
        <div style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <h2 style="margin: 0; font-size: 18px;">📝 Video Summary</h2>
          <button id="close-summary" style="
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 20px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          ">×</button>
        </div>
        <div id="summary-content" style="
          padding: 20px;
          max-height: 60vh;
          overflow-y: auto;
          line-height: 1.6;
        ">
          <div style="text-align: center; padding: 40px;">
            <div style="
              width: 40px;
              height: 40px;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #667eea;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto 16px;
            "></div>
            <p>Loading summary...</p>
          </div>
        </div>
      </div>
    `;

    // Add CSS for spinner animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Close modal handlers
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    modal.querySelector('#close-summary').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    document.body.appendChild(modal);
    summaryModal = modal;
    return modal;
  }

  // Handle summary button click
  function handleSummaryClick() {
    const videoUrl = window.location.href;
    const modal = summaryModal || createSummaryModal();

    modal.style.display = 'flex';

    // Reset content to loading state
    const content = modal.querySelector('#summary-content');
    content.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        "></div>
        <p>Fetching transcript and generating summary...</p>
      </div>
    `;

    // Send request to background script
    chrome.runtime.sendMessage({
      type: 'get_transcript_and_summary',
      payload: { videoUrl }
    }, (response) => {
      if (chrome.runtime.lastError) {
        content.innerHTML = `
          <div style="color: #e74c3c; text-align: center; padding: 20px;">
            <h3>❌ Error</h3>
            <p>${chrome.runtime.lastError.message}</p>
          </div>
        `;
        return;
      }

      if (!response || !response.success) {
        content.innerHTML = `
          <div style="color: #e74c3c; text-align: center; padding: 20px;">
            <h3>❌ Error</h3>
            <p>${response?.error || 'Failed to get transcript or summary'}</p>
          </div>
        `;
        return;
      }

      if (response.method === 'gemini') {
        // Display Gemini summary with proper formatting
        const formattedSummary = formatSummaryText(response.summary);
        content.innerHTML = `
          <div style="
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #374151;
          ">
            ${formattedSummary}
          </div>
        `;
    // In content.js, modify the handleSummaryClick function's ChatGPT section:
} else if (response.method === 'chatgpt') {
    // Show ChatGPT redirect option
    content.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <h3>🤖 ChatGPT Summary</h3>
            <p>The transcript is ready! Click below to open ChatGPT—it will automatically paste the summary prompt with transcript and send it.</p>
            <button id="open-chatgpt" style="
                background: #10a37f;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                margin: 16px 8px;
            ">Open ChatGPT</button>
            <button id="copy-transcript" style="
                background: #6b7280;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                margin: 16px 8px;
            ">Copy Transcript</button>
            <div style="
                margin-top: 20px;
                padding: 16px;
                background: #f8f9fa;
                border-radius: 8px;
                text-align: left;
                max-height: 200px;
                overflow-y: auto;
                font-size: 12px;
                border: 1px solid #e9ecef;
            ">
                <strong>Transcript Preview:</strong><br>
                ${response.transcript.substring(0, 500)}...
            </div>
            <div id="chatgpt-status" style="
                margin-top: 16px;
                padding: 8px;
                background: #f0fdf4;
                border-radius: 4px;
                color: #166534;
                font-size: 12px;
                display: none;
            "></div>
        </div>
    `;

    // Add event listeners for ChatGPT buttons
    const openChatGPTBtn = content.querySelector('#open-chatgpt');
    const statusDiv = content.querySelector('#chatgpt-status');
    
    openChatGPTBtn.addEventListener('click', () => {
        console.log('Study Time: User clicked Open ChatGPT button');
        openChatGPTBtn.disabled = true;
        statusDiv.style.display = 'block';
        statusDiv.textContent = 'Opening ChatGPT and preparing summary...';
        
        chrome.runtime.sendMessage({
            type: 'open_chatgpt_with_prompt',
            payload: { 
                prompt: response.chatgptPrompt, 
                transcript: response.transcript 
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Study Time: Error opening ChatGPT:', chrome.runtime.lastError);
                statusDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
                statusDiv.style.background = '#fef2f2';
                statusDiv.style.color = '#b91c1c';
                openChatGPTBtn.disabled = false;
            } else {
                console.log('Study Time: ChatGPT opened successfully');
                statusDiv.textContent = 'ChatGPT opened successfully! Check your browser tabs.';
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 1500);
            }
        });
    });

    content.querySelector('#copy-transcript').addEventListener('click', () => {
        console.log('Study Time: User clicked Copy Transcript button');
        navigator.clipboard.writeText(response.transcript).then(() => {
            const btn = content.querySelector('#copy-transcript');
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Study Time: Failed to copy transcript:', err);
        });
    });
}
    });
  }

  // Format summary text for better display
  function formatSummaryText(text) {
    if (!text) return 'No summary available';

    // Clean up the text
    let formatted = text.trim();

    // Handle markdown-style formatting
    formatted = formatted
      // Convert **bold** to HTML bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Convert *italic* to HTML italic
      .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
      // Convert numbered sections (1. 2. 3. etc.)
      .replace(/^(\d+\.\s*\*\*.*?\*\*):?\s*/gm, '<h3 style="color: #1f2937; margin: 24px 0 12px 0; font-size: 16px;">$1</h3>')
      // Convert bullet points with * or -
      .replace(/^\s*[\*\-]\s+(.+)/gm, '<li style="margin: 8px 0;">$1</li>')
      // Convert standalone bold sections at start of lines
      .replace(/^\*\*(.*?)\*\*:?\s*/gm, '<h4 style="color: #374151; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">$1:</h4>')
      // Convert line breaks to proper spacing
      .replace(/\n\s*\n/g, '</p><p style="margin: 16px 0;">')
      // Single line breaks become <br>
      .replace(/\n/g, '<br>');

    // Wrap consecutive <li> items in <ul>
  formatted = formatted.replace(
  /(<li[^>]*>.*?<\/li>)(\s*<li[^>]*>.*?<\/li>)*/gs,
  (match) => {
    return `<ul style="margin: 12px 0; padding-left: 20px;">${match}</ul>`;
  }
);

    // Wrap the content in paragraphs if not already wrapped
    if (!formatted.includes('<h3>') && !formatted.includes('<h4>')) {
      formatted = `<p style="margin: 16px 0;">${formatted}</p>`;
    } else {
      // Ensure content after headings is wrapped
      formatted = formatted.replace(/(<\/h[34]>)((?:(?!<h[34]|<ul|<p).)*)/gs, '$1<p style="margin: 12px 0;">$2</p>');
    }

    // Clean up empty paragraphs and extra spacing
    formatted = formatted
      .replace(/<p[^>]*>\s*<\/p>/g, '')
      .replace(/(<\/p>)\s*(<p[^>]*>)/g, '$1$2')
      .replace(/(<br\s*\/?>){3,}/g, '<br><br>');

    return formatted;
  }

  // Add summary button to YouTube's right sidebar
  function addSummaryButton() {
    if (!isVideoPage()) return;

    // Remove existing button
    if (summaryButton) {
      summaryButton.remove();
    }

    // Wait for right sidebar to load
    const checkForSidebar = () => {
      const sidebarSelectors = [
        '#secondary-inner',
        '#secondary',
        '.ytd-watch-next-secondary-results-renderer',
        '#related'
      ];

      for (const selector of sidebarSelectors) {
        const sidebar = document.querySelector(selector);
        if (sidebar) {
          const button = createSummaryButton();
          sidebar.insertBefore(button, sidebar.firstChild);
          log('✅ Summary button added to sidebar');
          return true;
        }
      }
      return false;
    };

    // Try immediately, then retry with delays
    if (!checkForSidebar()) {
      setTimeout(() => {
        if (!checkForSidebar()) {
          setTimeout(checkForSidebar, 2000);
        }
      }, 1000);
    }
  }

  // Process current video
  async function processCurrentVideo() {
    const videoId = getCurrentVideoId();

    if (!videoId || !isVideoPage()) {
      log('❌ Not a video page or no video ID');
      return;
    }

    // Skip if already processing this video
    if (currentVideoId === videoId && isProcessing) {
      log('⚠️ Already processing:', videoId);
      return;
    }

    // Clear any existing timeout
    if (processingTimeout) {
      clearTimeout(processingTimeout);
      processingTimeout = null;
    }

    // Update state
    currentVideoId = videoId;
    isProcessing = true;

    log('🚀 Processing video:', videoId);

    // Add summary button
    addSummaryButton();

    try {
      // Wait a bit for page to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get video data with retries
      let videoData = getVideoData();
      let retries = 0;
      const maxRetries = 3;

      while ((!videoData.title || videoData.title === 'YouTube') && retries < maxRetries) {
        retries++;
        log(`📝 Retry ${retries}: Waiting for video data...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        videoData = getVideoData();
      }

      // Ensure we're still on the same video
      if (getCurrentVideoId() !== videoId) {
        log('🔄 Video changed during processing, aborting');
        isProcessing = false;
        return;
      }

      const payload = {
        title: videoData.title,
        description: videoData.description,
        url: window.location.href,
        videoId: videoId
      };

      log('📤 Sending to background:', {
        videoId,
        title: payload.title.substring(0, 50) + '...'
      });

      // Send to background script
      chrome.runtime.sendMessage({ type: 'classify_video', payload }, (response) => {
        // Double-check we're still on the same video
        if (getCurrentVideoId() !== videoId) {
          log('❌ Video changed, ignoring response');
          return;
        }

        isProcessing = false;

        if (chrome.runtime.lastError) {
          log('💥 Runtime error:', chrome.runtime.lastError.message);
          return;
        }

        if (!response) {
          log('❌ No response from background');
          return;
        }

        log('✅ Response:', response);

        if (response.action === 'block') {
          log('🚫 BLOCKING video:', videoId, '-', response.reason);

          // Redirect logic
          if (response.redirectUrl) {
            log('🔗 Redirecting to:', response.redirectUrl);
            window.location.href = response.redirectUrl;
          } else {
            log('🏠 Going back or to home');
            try {
              if (window.history.length > 1) {
                window.history.back();
                // Safety fallback
                setTimeout(() => {
                  if (window.location.href.includes(videoId)) {
                    window.location.href = 'https://www.youtube.com';
                  }
                }, 2000);
              } else {
                window.location.href = 'https://www.youtube.com';
              }
            } catch (e) {
              window.location.href = 'https://www.youtube.com';
            }
          }
        } else if (response.action === 'allow') {
          log('✅ ALLOWING video:', videoId, '-', response.reason);
        }
      });

    } catch (error) {
      log('💥 Processing error:', error);
      isProcessing = false;
    }
  }

  // Simple URL monitoring
  function startMonitoring() {
    let lastUrl = window.location.href;

    // Check URL every 200ms
    setInterval(() => {
      const currentUrl = window.location.href;

      if (currentUrl !== lastUrl) {
        log('🔄 URL changed:', lastUrl, '→', currentUrl);
        lastUrl = currentUrl;

        // Reset state on URL change
        currentVideoId = null;
        isProcessing = false;
        if (processingTimeout) {
          clearTimeout(processingTimeout);
          processingTimeout = null;
        }

        // Remove old summary button
        if (summaryButton) {
          summaryButton.remove();
          summaryButton = null;
        }

        // Process new video if on video page
        if (isVideoPage()) {
          processingTimeout = setTimeout(() => {
            processCurrentVideo();
          }, 500);
        }
      }
    }, 200);

    // YouTube navigation events
    window.addEventListener('yt-navigate-finish', () => {
      log('🎬 YouTube navigate finish');
      if (isVideoPage()) {
        processingTimeout = setTimeout(() => {
          processCurrentVideo();
        }, 1000);
      }
    });

    // Popstate for browser navigation
    window.addEventListener('popstate', () => {
      log('🔙 Popstate event');
      setTimeout(() => {
        if (isVideoPage()) {
          processCurrentVideo();
        }
      }, 500);
    });

    log('🔍 Monitoring started');
  }

  // Initialize
  function init() {
    log('🚀 Initializing StudyTime');

    startMonitoring();

    // Process current video if on video page
    if (isVideoPage()) {
      log('📺 On video page, processing...');
      processingTimeout = setTimeout(() => {
        processCurrentVideo();
      }, 1500); // Give page time to load
    }

    log('✅ StudyTime ready');
  }

  // Start when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();