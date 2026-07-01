function createFallbackResponse(code, language, fileName = 'index.html') {
  return {
    suggestion: `// Ridey is not available right now.\n// Original ${language} code:\n\n${code}`,
    fileUpdates: [{ fileName, suggestion: code }],
    explanation:
      'Ridey could not reach OpenAI. Check OPENAI_API_KEY on the server and try again.',
    confidence: 0.1,
  };
}

function languageForFileName(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return 'javascript';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  return 'text';
}

function pickStylesheetFile(projectFiles, activeFileName) {
  if (activeFileName && String(activeFileName).endsWith('.css')) return activeFileName;
  const files = projectFiles || [];
  const styleCss = files.find((f) => f.fileName === 'style.css');
  if (styleCss) return 'style.css';
  const anyCss = files.find((f) => String(f.fileName || '').endsWith('.css'));
  return anyCss ? anyCss.fileName : 'style.css';
}

function pickScriptFile(projectFiles, activeFileName) {
  if (activeFileName && /\.(js|mjs)$/i.test(String(activeFileName))) return activeFileName;
  const files = projectFiles || [];
  const scriptJs = files.find((f) => f.fileName === 'script.js');
  if (scriptJs) return 'script.js';
  const anyJs = files.find(
    (f) => String(f.fileName || '').endsWith('.js') || String(f.fileName || '').endsWith('.mjs')
  );
  return anyJs ? anyJs.fileName : 'script.js';
}

function buildMultiFileSystemPrompt({ cssFile, jsFile, context, extraPersona }) {
  return `You are Ridey, the friendly WebXRide AI assistant — a helpful, upbeat purple car wearing a VR headset.
You speak concisely, with a coaching tone. You prefer step-by-step fixes, small actionable diffs, and performance-minded guidance.
Use simple language, avoid jargon unless necessary, and never guess when unsure — ask a brief clarifying question first.

Primary expertise areas:
- A-Frame framework for WebVR/WebAR
- Three.js for 3D graphics
- Modern JavaScript (ES6+)
- HTML5 and CSS3
- WebXR APIs
- Performance optimization for web-based 3D experiences

Context: ${context || 'WebXR development with A-Frame, Three.js, and modern web technologies'}

This is a multi-file flat web page project (index.html, ${cssFile}, ${jsFile}, and optional extra files).

CRITICAL file separation rules — follow these unless the user explicitly asks otherwise:
1. Put ALL new or changed CSS in "${cssFile}" (or another existing .css file if the user is editing that file). Do NOT add <style> blocks, inline style="" attributes, or embedded CSS in HTML.
2. Put ALL new or changed JavaScript in "${jsFile}" (or another existing .js file if the user is editing that file). Do NOT add inline <script> code in HTML — keep <script src="${jsFile}"></script> references.
3. HTML files contain structure and semantic markup only. Preserve existing <link rel="stylesheet" href="${cssFile}"> and <script src="${jsFile}"> references.
4. Return only files you actually changed in fileUpdates. Each suggestion must be the COMPLETE updated file content.
5. Keep a positive, encouraging tone.

${extraPersona}

Respond in JSON with:
- "fileUpdates": Array of { "fileName": string, "suggestion": string } for each changed file
- "explanation": What changed and why
- "confidence": Number 0-1`;
}

async function analyzeCodeWithAI(request) {
  const {
    code,
    language,
    fileName,
    prompt,
    context,
    temperature: customTemperature,
    projectFiles,
    activeFileName,
  } = request;
  const multiFile = Array.isArray(projectFiles) && projectFiles.length > 0;

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature =
    customTemperature !== undefined
      ? customTemperature
      : process.env.OPENAI_TEMPERATURE !== undefined
        ? Number(process.env.OPENAI_TEMPERATURE)
        : 0.2;
  const maxTokens =
    process.env.OPENAI_MAX_TOKENS !== undefined ? Number(process.env.OPENAI_MAX_TOKENS) : 1500;
  const topP = process.env.OPENAI_TOP_P !== undefined ? Number(process.env.OPENAI_TOP_P) : 1;
  const extraPersona = process.env.RIDEY_PERSONA || '';

  if (!apiKey || !apiKey.trim() || apiKey === 'your_openai_api_key_here') {
    return {
      suggestion: `<!-- OpenAI API key not configured on server -->\n${code}`,
      fileUpdates: [{ fileName: fileName || activeFileName || 'index.html', suggestion: code }],
      explanation:
        'Ridey requires OPENAI_API_KEY in the server environment. Ask your team leader, teacher, or admin to configure it.',
      confidence: 0,
    };
  }

  const cssFile = multiFile ? pickStylesheetFile(projectFiles, activeFileName) : 'style.css';
  const jsFile = multiFile ? pickScriptFile(projectFiles, activeFileName) : 'script.js';

  const systemPrompt = multiFile
    ? buildMultiFileSystemPrompt({ cssFile, jsFile, context, extraPersona })
    : `You are Ridey, the friendly WebXRide AI assistant — a helpful, upbeat purple car wearing a VR headset.
You speak concisely, with a coaching tone. You prefer step-by-step fixes, small actionable diffs, and performance-minded guidance.
Use simple language, avoid jargon unless necessary, and never guess when unsure — ask a brief clarifying question first.

Primary expertise areas:
- A-Frame framework for WebVR/WebAR
- Three.js for 3D graphics
- Modern JavaScript (ES6+)
- HTML5 and CSS3
- WebXR APIs
- Performance optimization for web-based 3D experiences

Context: ${context || 'WebXR development with A-Frame, Three.js, and modern web technologies'}

Guidelines:
1. Lead with a complete, working solution
2. Provide the ENTIRE rewritten code file with all improvements applied
3. Preserve all existing functionality while adding improvements
4. Consider WebXR-specific best practices
5. Keep a positive, encouraging tone

${extraPersona}

Respond in JSON with:
- "suggestion": The COMPLETE rewritten code file
- "explanation": What changed and why
- "confidence": Number 0-1`;

  const userPrompt = multiFile
    ? `The team member or student is currently editing: ${activeFileName || fileName || 'index.html'}

User Question: ${prompt}

Project files:
${projectFiles
  .map(
    (f) =>
      `### ${f.fileName}\n\`\`\`${f.language || languageForFileName(f.fileName)}\n${f.content || ''}\n\`\`\``
  )
  .join('\n\n')}`
    : `Language: ${language}
${fileName ? `File: ${fileName}` : ''}

User Question: ${prompt}

Code to analyze:
\`\`\`${language}
${code}
\`\`\``;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'new-keys=true',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ai_response',
            strict: true,
            schema: multiFile
              ? {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    fileUpdates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          fileName: { type: 'string' },
                          suggestion: { type: 'string' },
                        },
                        required: ['fileName', 'suggestion'],
                      },
                    },
                    explanation: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                  },
                  required: ['fileUpdates', 'explanation', 'confidence'],
                }
              : {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    suggestion: { type: 'string' },
                    explanation: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                  },
                  required: ['suggestion', 'explanation', 'confidence'],
                },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    let jsonText = content.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    let aiResponse;
    try {
      aiResponse = JSON.parse(jsonText);
    } catch {
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (match) aiResponse = JSON.parse(match[0]);
      else {
        const fenced = content.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
        return {
          suggestion: fenced ? fenced[1] : content,
          explanation: 'AI returned a non-JSON response. Showing best-effort suggestion.',
          confidence: 0.5,
        };
      }
    }

    if (!aiResponse.explanation) {
      throw new Error('Invalid response format from AI');
    }

    if (multiFile) {
      const fileUpdates = Array.isArray(aiResponse.fileUpdates) ? aiResponse.fileUpdates : [];
      if (!fileUpdates.length) {
        throw new Error('Invalid response format from AI');
      }
      const primary =
        fileUpdates.find((f) => f.fileName === (activeFileName || fileName)) || fileUpdates[0];
      return {
        fileUpdates,
        suggestion: primary?.suggestion || '',
        explanation: aiResponse.explanation,
        confidence: aiResponse.confidence ?? 0.8,
      };
    }

    if (!aiResponse.suggestion) {
      throw new Error('Invalid response format from AI');
    }

    return {
      suggestion: aiResponse.suggestion,
      fileUpdates: [{ fileName: fileName || 'index.html', suggestion: aiResponse.suggestion }],
      explanation: aiResponse.explanation,
      confidence: aiResponse.confidence ?? 0.8,
    };
  } catch (err) {
    console.error('Ridey OpenAI error:', err.message);
    return createFallbackResponse(code, language, fileName || activeFileName || 'index.html');
  }
}

module.exports = { analyzeCodeWithAI, createFallbackResponse };
