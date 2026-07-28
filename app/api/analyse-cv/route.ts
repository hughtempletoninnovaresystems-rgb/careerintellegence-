import { NextResponse } from "next/server";
const pdf = require("pdf-parse");
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const file = form.get("cv");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";

    if (file.type === "application/pdf") {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      const data = await mammoth.extractRawText({
        buffer,
      });

      text = data.value;
    }

    const prompt = `
Analyse the supplied CV.

Identify the candidate's competencies based only on information explicitly stated or strongly supported by the CV.

Return ONLY valid JSON matching the following schema.

{
  "candidateName": "",
  "currentRole": "",
  "competencies": [
    {
      "competency": "",
      "evidence": "",
      "sourceSection": "",
      "confidence": 0.0
    }
  ]
}

Rules:

- Do not return markdown.
- Do not include explanatory text.
- Each competency must include supporting evidence.
- sourceSection should be one of:
  - Professional Summary
  - Employment History
  - Skills
  - Education
  - Certifications
  - Projects
- confidence must be a decimal between 0.0 and 1.0.
- Do not invent competencies.
- If the name or role cannot be determined, return an empty string.

CV:

${text}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let result;

    try {
      const clean = (response.text ?? "")
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      result = JSON.parse(clean);

    } catch (error) {
      console.error("Gemini returned:", response.text);

      return NextResponse.json(
        {
          error: "AI did not return valid JSON",
          raw: response.text,
        },
        { status: 500 }
      );
    }

  } catch (err) {
    console.error("========== ANALYSE CV ERROR ==========");
    console.error(err);

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}