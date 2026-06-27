export async function fetchRideyStatus() {
  const res = await fetch('/api/ridey/status');
  const data = await res.json();
  if (!data.success) return { enabled: false, hasApiKey: false };
  return { enabled: !!data.enabled, hasApiKey: !!data.hasApiKey };
}

export async function analyzeWithRidey({
  code,
  language,
  fileName,
  prompt,
  temperature,
  projectFiles,
  activeFileName,
}) {
  const res = await fetch('/api/ridey/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      code,
      language,
      fileName,
      prompt,
      temperature,
      projectFiles,
      activeFileName,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Ridey request failed');
  return {
    suggestion: data.suggestion,
    fileUpdates: data.fileUpdates || [],
    explanation: data.explanation,
    confidence: data.confidence,
  };
}
