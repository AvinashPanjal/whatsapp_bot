import { GoogleGenAI } from '@google/genai';

let aiClient = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

/**
 * Sends prompt to Gemini model with automatic model fallbacks for 503 high-demand spikes.
 * @param {string} prompt - User message from WhatsApp
 * @param {string} [customSystemInstruction] - Optional override system prompt
 * @returns {Promise<string>}
 */
export async function askGemini(prompt, customSystemInstruction) {
  const ai = getAiClient();
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  
  // List of active, verified Gemini models to try sequentially in case of 503 high demand
  const modelsToTry = [
    primaryModel,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ];
  const uniqueModels = [...new Set(modelsToTry)];

  const systemInstruction = customSystemInstruction || process.env.SYSTEM_INSTRUCTION || 
    'You are a helpful, smart, and friendly WhatsApp AI assistant. Keep your replies concise, natural, and formatted cleanly for chat (use bullet points or emojis where appropriate).';

  let lastError = null;

  for (const modelName of uniqueModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Model ${modelName} returned error: ${error.message || error}. Retrying with next model...`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.error('All Gemini models failed:', lastError);
  return `⚠️ Gemini AI is currently experiencing high demand. Please try again in a moment.`;
}
