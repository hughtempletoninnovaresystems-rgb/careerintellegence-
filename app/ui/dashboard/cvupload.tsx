"use client";

import { useState } from "react";

export default function UploadCV() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function upload(file: File) {
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("cv", file);

      const res = await fetch("/api/analyse-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setResult(data);
        return;
      }

      setResult(data);
    } catch (err) {
      console.error(err);

      setResult({
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">
        Upload CV
      </h1>

      <input
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={(e) => {
          if (e.target.files?.length) {
            upload(e.target.files[0]);
          }
        }}
      />

      {loading && (
        <p className="mt-4">Analysing CV...</p>
      )}

      {result && (
        <pre className="mt-6 rounded bg-slate-100 p-4 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}