import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";
import extract from "pdf-extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

async function extractPdfText(buffer: Buffer) {
  const data = await extract(buffer);

  return data.text;
}

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
      text = await extractPdfText(buffer);
    } else if (file.name.endsWith(".docx")) {
      const data = await mammoth.extractRawText({
        buffer,
      });

      text = data.value;
    } else {
      return NextResponse.json(
        {
          error: "Only PDF and DOCX files are supported",
        },
        { status: 400 }
      );
    }

    console.log("CV text length:", text.length);

    const prompt = `
Analyse the supplied CV.

Identify the candidate's competencies based only on information explicitly stated or strongly supported by the CV.

Return ONLY valid JSON.

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
- confidence must be between 0.0 and 1.0.
- Do not invent competencies.

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

    const clean = (response.text ?? "")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const result = JSON.parse(clean);

    return NextResponse.json(result);

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