// background.js
const GEMINI_MODEL = "gemini-2.0-flash-exp";
let pendingClassifications = new Map(); // Track pending classifications by videoId

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Study Time: Received message', msg);
  
  if (msg && msg.type === 'classify_video') {
    const { title, description, url, videoId } = msg.payload;
    console.log('Study Time: Processing video classification', { title, url, videoId });
    
    // Cancel any pending classification for the same video
    if (pendingClassifications.has(videoId)) {
      console.log('Study Time: Cancelling previous classification for video', videoId);
      // We can't actually cancel the fetch, but we can ignore its response
      pendingClassifications.delete(videoId);
    }
    
    // Mark this classification as pending
    const classificationId = Date.now();
    pendingClassifications.set(videoId, classificationId);
    
    // Retrieve API key
    chrome.storage.sync.get(['geminiApiKey', 'redirectPlaylistUrl'], async (items) => {
      console.log('Study Time: Retrieved storage items', { hasApiKey: !!items.geminiApiKey, redirectPlaylistUrl: items.redirectPlaylistUrl });
      
      const apiKey = items.geminiApiKey;
      const redirectPlaylistUrl = items.redirectPlaylistUrl || null;
      
      if (!apiKey) {
        console.warn('Study Time: No API key found');
        const noKeyResponse = { status: 'no_key' };
        console.log('Study Time: Sending no_key response:', noKeyResponse);
        sendResponse(noKeyResponse);
        return;
      }

      // Build the prompt
      const userPrompt = `strictly Classify whether this YouTube video is educational / study-related and make sure its not just fun study stuff but more similar to engineering and cs course and educational but not important videos count like fun facts or video essays but only core cs,programming,etc .

Return a JSON object (ONLY JSON) with exactly these fields:
{
  "allowed": boolean,
  "reason": string
}

allowed = true  => video is educational, tutorial, lecture, study guide, course content, academic explanation, exam prep, or directly helps learning.
allowed = false => video is entertainment, music, vlog, gaming, reaction, meme, movie clip, or unrelated to studying.

Input:
Title: ${title}
Description: ${description}
URL: ${url}`;

      console.log('Study Time: Input data:', {
        title: title,
        description: description?.substring(0, 100) + '...',
        url: url
      });

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
        console.log('Study Time: Calling Gemini API endpoint:', endpoint.replace(apiKey, 'API_KEY_HIDDEN'));
        
        const requestBody = {
          contents: [
            {
              parts: [
                { text: userPrompt }
              ]
            }
          ]
        };
        
        console.log('Study Time: Request body:', JSON.stringify(requestBody, null, 2));

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        console.log('Study Time: API response status:', resp.status, resp.statusText);

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error('Study Time: Gemini API error', resp.status, errorText);
          const errorResponse = { status: 'error', error: `API Error: ${resp.status} - ${errorText}` };
          console.log('Study Time: Sending error response:', errorResponse);
          sendResponse(errorResponse);
          return;
        }

        const responseData = await resp.json();
        console.log('Study Time: Raw Gemini response:', JSON.stringify(responseData, null, 2));

        // Parse response according to Gemini API structure
        if (!responseData.candidates || responseData.candidates.length === 0) {
          console.error('Study Time: No candidates in response');
          const errorResponse = { status: 'error', error: 'No candidates in API response' };
          console.log('Study Time: Sending error response:', errorResponse);
          sendResponse(errorResponse);
          return;
        }

        const candidate = responseData.candidates[0];
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          console.error('Study Time: Invalid candidate structure');
          const errorResponse = { status: 'error', error: 'Invalid response structure' };
          console.log('Study Time: Sending error response:', errorResponse);
          sendResponse(errorResponse);
          return;
        }

        const responseText = candidate.content.parts[0].text;
        console.log('Study Time: Extracted response text:', responseText);

        // Parse JSON from response text
        let resultObj = null;
        let cleanResponseText = responseText.trim();
        
        // Handle markdown code blocks that Gemini often returns
        if (cleanResponseText.startsWith('```json') && cleanResponseText.endsWith('```')) {
          cleanResponseText = cleanResponseText.slice(7, -3).trim();
          console.log('Study Time: Removed markdown code blocks, clean text:', cleanResponseText);
        } else if (cleanResponseText.startsWith('```') && cleanResponseText.endsWith('```')) {
          cleanResponseText = cleanResponseText.slice(3, -3).trim();
          console.log('Study Time: Removed generic code blocks, clean text:', cleanResponseText);
        }
        
        try {
          resultObj = JSON.parse(cleanResponseText);
          console.log('Study Time: Successfully parsed JSON result:', resultObj);
        } catch (parseError) {
          console.warn('Study Time: Direct JSON parse failed, trying fallback extraction', parseError);
          
          // Fallback: try to extract JSON object from response
          const firstBrace = cleanResponseText.indexOf('{');
          const lastBrace = cleanResponseText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
              const jsonStr = cleanResponseText.slice(firstBrace, lastBrace + 1);
              resultObj = JSON.parse(jsonStr);
              console.log('Study Time: Fallback JSON extraction succeeded:', resultObj);
            } catch (fallbackError) {
              console.error('Study Time: All JSON parsing attempts failed', fallbackError, 'original text:', responseText);
              const errorResponse = { status: 'error', error: 'Could not parse JSON response' };
              console.log('Study Time: Sending error response:', errorResponse);
              sendResponse(errorResponse);
              return;
            }
          } else {
            console.error('Study Time: Could not find JSON braces in response:', cleanResponseText);
            const errorResponse = { status: 'error', error: 'Could not extract JSON from response' };
            console.log('Study Time: Sending error response:', errorResponse);
            sendResponse(errorResponse);
            return;
          }
        }

        // Validate result structure
        if (!resultObj || typeof resultObj.allowed !== 'boolean') {
          console.warn('Study Time: Invalid result structure, defaulting to allow', resultObj);
          const allowResponse = { action: 'allow', reason: 'Invalid API response structure' };
          console.log('Study Time: Sending allow response (invalid structure):', allowResponse);
          sendResponse(allowResponse);
          return;
        }

        console.log('Study Time: Final classification result:', {
          allowed: resultObj.allowed,
          reason: resultObj.reason
        });
        
        // Check if this classification is still valid (not superseded by a newer one)
        if (!pendingClassifications.has(videoId) || pendingClassifications.get(videoId) !== classificationId) {
          console.log('Study Time: Classification superseded, ignoring result for video', videoId);
          return;
        }
        
        // Remove from pending classifications
        pendingClassifications.delete(videoId);

        if (resultObj.allowed === true) {
          const allowResponse = {
            action: 'allow',
            reason: resultObj.reason || 'Video classified as educational'
          };
          console.log('Study Time: Sending allow response:', allowResponse);
          sendResponse(allowResponse);
        } else {
          const blockResponse = {
            action: 'block',
            reason: resultObj.reason || 'Video classified as non-educational',
            redirectUrl: redirectPlaylistUrl || null
          };
          console.log('Study Time: Sending block response:', blockResponse);
          sendResponse(blockResponse);
        }
      } catch (error) {
        console.error('Study Time: Classification failed with error:', error);
        const errorResponse = {
          status: 'error',
          error: error.message || 'Unknown error occurred'
        };
        console.log('Study Time: Sending error response:', errorResponse);
        sendResponse(errorResponse);
      }
    });

    // Indicate we'll send a response asynchronously
    return true;
  }

  // Handle transcript and summary requests
  if (msg && msg.type === 'get_transcript_and_summary') {
    const { videoUrl } = msg.payload;
    console.log('Study Time: Processing transcript request for:', videoUrl);

    chrome.storage.sync.get(['geminiApiKey', 'summaryMethod'], async (items) => {
      const apiKey = items.geminiApiKey;
      const summaryMethod = items.summaryMethod || 'gemini'; // 'gemini' or 'chatgpt'
      
      console.log('Study Time: Retrieved settings for summary:', { 
        hasApiKey: !!apiKey, 
        summaryMethod: summaryMethod 
      });

      try {
        // First, get the transcript
        console.log('Study Time: Fetching transcript from Tactiq API');
        const transcriptResponse = await fetch('https://tactiq-apps-prod.tactiq.io/transcript', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoUrl: videoUrl,
            langCode: 'en'
          })
        });

        if (!transcriptResponse.ok) {
          throw new Error(`Transcript API error: ${transcriptResponse.status}`);
        }

        const transcriptData = await transcriptResponse.json();
        console.log('Study Time: Transcript data received:', { 
          title: transcriptData?.title, 
          captionsCount: transcriptData?.captions?.length || 0 
        });

        if (!transcriptData || !transcriptData.captions || transcriptData.captions.length === 0) {
          throw new Error('No transcript available for this video');
        }

        // Convert captions array to readable transcript
        const transcript = transcriptData.captions
          .map(caption => caption.text)
          .join(' ')
          .trim();

        console.log('Study Time: Processed transcript length:', transcript.length);

        // Now handle summary based on method
        if (summaryMethod === 'gemini' && apiKey) {
          console.log('Study Time: Using Gemini for summary');
          
          const summaryPrompt = `Please provide a comprehensive summary of this YouTube video transcript. Structure your response with:

1. **Main Topic**: Brief overview of what the video is about
2. **Key Points**: List the most important concepts covered
3. **Technical Details**: Any specific technical information, code examples, or methodologies mentioned
4. **Takeaways**: Main lessons or conclusions

Here's the transcript:

${transcript}`;

          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
          
          const summaryResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: summaryPrompt }
                  ]
                }
              ]
            })
          });

          if (!summaryResponse.ok) {
            throw new Error(`Gemini API error: ${summaryResponse.status}`);
          }

          const summaryData = await summaryResponse.json();
          const summaryText = summaryData.candidates[0]?.content?.parts[0]?.text;

          sendResponse({
            success: true,
            method: 'gemini',
            transcript: transcript,
            summary: summaryText || 'Failed to generate summary'
          });

        } else {
          // Use ChatGPT method
          console.log('Study Time: Using ChatGPT method');
          const chatgptPrompt = `Please provide a comprehensive summary of this YouTube video transcript. Structure your response with:

1. **Main Topic**: Brief overview of what the video is about
2. **Key Points**: List the most important concepts covered
3. **Technical Details**: Any specific technical information, code examples, or methodologies mentioned
4. **Takeaways**: Main lessons or conclusions

Here's the transcript:

${transcript}`;

          sendResponse({
            success: true,
            method: 'chatgpt',
            transcript: transcript,
            chatgptPrompt: chatgptPrompt
          });
        }

      } catch (error) {
        console.error('Study Time: Transcript/Summary error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    });

    return true; // Indicate async response
  }

// In background.js, modify the 'open_chatgpt_with_prompt' handler:
// Add this handler in your background.js
if (msg.type === 'open_chatgpt_with_prompt') {
  const { prompt, transcript } = msg.payload;
  
  chrome.tabs.create({ url: 'https://chat.openai.com/' }, (tab) => {
    const onTabUpdated = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        
        // Wait for ChatGPT to initialize
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-chatgpt.js']
          }).then(() => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'inject_chatgpt_prompt',
              payload: { prompt, transcript }
            });
          }).catch(err => {
            console.error('Injection failed:', err);
          });
        }, 1500); // Increased delay for reliability
      }
    };
    
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}
});