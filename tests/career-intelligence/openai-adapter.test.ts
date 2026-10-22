import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { careerIntelligenceConfig } from "../../app/lib/career-intelligence/config.ts";

// Isolate SDK transport so tests exercise request construction without API calls.
function loadAdapter({ apiKey = "test-key", status = "completed" } = {}) {
  const requests: Array<{ body: any; options: any }> = [];
  const compiled = ts.transpileModule(
    readFileSync("app/lib/career-intelligence/ai/openai-adapter.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports: any = {};
  const dependencies: Record<string, any> = {
    openai: { default: class {
      responses = { create: async (body: any, options: any) => {
        requests.push({ body, options });
        return { status, output_text: '{"ok":true}', model: "reported-model" };
      } };
    } },
    "openai/helpers/zod": { zodTextFormat: () => ({ type: "json_schema", name: "career_revised_preview" }) },
    "./revised-contract": { revisedAIEnvelopeProviderSchema: {} },
    "../errors": { AIProviderError: Error },
    "../config": { careerIntelligenceConfig },
  };
  new Function("require", "exports", "process", compiled)(
    (name: string) => {
      assert.ok(name in dependencies, `Unexpected import: ${name}`);
      return dependencies[name];
    }, exports, { env: { OPENAI_API_KEY: apiKey } },
  );
  return { generate: exports.generateOpenAIJson, requests };
}

test("all operation formats request the pinned OpenAI model and medium reasoning without pilot flags", async () => {
  const { generate, requests } = loadAdapter();
  for (const operation of [undefined, "clarification_evaluation", "revised_ic_preview"]) {
    const result = await generate({ model: careerIntelligenceConfig.aiModel, prompt: "Return JSON", timeoutMs: 1234, operation });
    assert.equal(result.actualModel, "reported-model");
  }
  assert.equal(careerIntelligenceConfig.aiProvider, "openai");
  assert.equal(requests.length, 3);
  for (const { body, options } of requests) {
    assert.equal(body.model, "gpt-6.1-sol");
    assert.deepEqual(body.reasoning, { effort: "medium" });
    assert.equal(body.store, false);
    assert.equal(options.timeout, 1234);
    assert.equal(body.previous_response_id, undefined);
  }
  assert.equal(requests[0].body.text.format.type, "json_object");
  assert.equal(requests[1].body.text.format.name, "career_clarifications");
  assert.equal(requests[1].body.text.format.strict, true);
  assert.equal(requests[2].body.text.format.name, "career_revised_preview");
});

test("missing OpenAI credentials fail before transport with no fallback", async () => {
  const { generate, requests } = loadAdapter({ apiKey: "" });
  await assert.rejects(generate({ model: careerIntelligenceConfig.aiModel, prompt: "Return JSON", timeoutMs: 100 }), /configuration is incomplete/);
  assert.equal(requests.length, 0);
});

test("incomplete OpenAI output cannot become an assessment", async () => {
  const { generate } = loadAdapter({ status: "incomplete" });
  await assert.rejects(generate({ model: careerIntelligenceConfig.aiModel, prompt: "Return JSON", timeoutMs: 100 }), /did not return a complete result/);
});
