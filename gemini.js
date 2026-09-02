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
 * Sends prompt to Gemini model and returns response text.
 * @param {string} prompt - User message from WhatsApp
 * @param {string} [customSystemInstruction] - Optional override system prompt
 * @returns {Promise<string>}
 */
export async function askGemini(prompt, customSystemInstruction) {
  try {
    const ai = getAiClient();
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    
    const systemInstruction = customSystemInstruction || process.env.SYSTEM_INSTRUCTION || 
      'You are a helpful, smart, and friendly WhatsApp AI assistant. Keep your replies concise, natural, and formatted cleanly for chat (use bullet points or emojis where appropriate).';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text || "Sorry, I couldn't generate a response.";
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return `⚠️ Error generating response: ${error.message || 'Unknown error'}`;
  }
}
