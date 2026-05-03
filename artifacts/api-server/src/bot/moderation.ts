import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
      apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? "dummy",
    });
  }
  return _openai;
}

const TEXT_SYSTEM = `You are a strict content moderation assistant.
Determine if the message contains explicit adult/sexual content (18+).
Do NOT flag profanity/swearing alone — only explicit sexual content counts.
Reply ONLY with YES or NO.`;

export async function isAdultText(text: string): Promise<boolean> {
  if (text.length < 5) return false;
  try {
    const res = await getClient().chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 5,
      messages: [
        { role: "system", content: TEXT_SYSTEM },
        { role: "user", content: text.slice(0, 500) },
      ],
    });
    const answer = res.choices[0]?.message?.content?.trim().toUpperCase() ?? "";
    return answer.startsWith("YES");
  } catch {
    return false;
  }
}

export async function isAdultImage(imageUrl: string): Promise<boolean> {
  try {
    const res = await getClient().chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 5,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" },
            },
            {
              type: "text",
              text: "Does this image contain explicit adult/sexual (18+) content? Reply ONLY YES or NO.",
            },
          ],
        },
      ],
    });
    const answer = res.choices[0]?.message?.content?.trim().toUpperCase() ?? "";
    return answer.startsWith("YES");
  } catch {
    return false;
  }
}
