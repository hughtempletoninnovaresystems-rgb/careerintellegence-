import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

async function extractPdfText(buffer: Buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  });

  const pdfDocument = await loadingTask.promise;

  let text = "";

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);

    const content = await page.getTextContent();

    text += content.items
      .map((item: any) => item.str)
      .join(" ");

    text += "\n";
  }

  return text;
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
    } else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    ) {
      const data = await mammoth.extractRawText({
        buffer,
      });

      text = data.value;
    } else {
      return NextResponse.json(
        {
          error: "Unsupported file type",
        },
        { status: 400 }
      );
    }

    console.log("CV text length:", text.length);

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
- sourceSection should identify where the evidence came from.
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

    } catch {
      console.error("Gemini returned:", response.text);

      return NextResponse.json(
        {
          error: "AI did not return valid JSON",
          raw: response.text,
        },
        { status: 500 }
      );
    }

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