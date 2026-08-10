"use client";

import { useState } from "react";

type Competency = {
  competency: string;
  evidence?: string;
  sourceSection?: string;
  confidence?: number;
};

type Gap = {
  competency: string;
  reason: string;
  question: string;
};

type AnalysisResult = {
  mode?: "comparison" | "capability_assessment";
  roleExists?: boolean;

  candidateName?: string;
  currentRole?: string;

  databaseRole?: {
    id: string;
    name: string;
    description?: string;
    jobTitle?: string;
  };

  databaseCompetencies?: Competency[];
  cvCompetencies?: Competency[];
  matchedCompetencies?: Competency[];
  gaps?: Gap[];

  capabilitySummary?: string;

  message?: string;
  error?: string;
};

type DemonstratedCompetency = {
  competency: string;
  demonstrated: boolean;
  evidence?: string;
  confidence?: number;
};

type AssessmentResponse = {
  demonstratedCompetencies?: DemonstratedCompetency[];
  remainingGaps?: Gap[];

  savedCompetencies?: {
    competencyId: string;
    competency: string;
    confidence: number;
    evidence: string;
    demonstrated: boolean;
  }[];

  savedCompetencyCount?: number;

  message?: string;
  error?: string;
};

export default function UploadCV() {
  const [result, setResult] =
    useState<AnalysisResult | null>(null);

  const [answers, setAnswers] =
    useState<Record<number, string>>({});

  const [loading, setLoading] =
    useState(false);

  const [assessing, setAssessing] =
    useState(false);

  const [assessmentResult, setAssessmentResult] =
    useState<AssessmentResponse | null>(null);

  async function upload(file: File) {
    setLoading(true);
    setResult(null);
    setAnswers({});
    setAssessmentResult(null);

    try {
      const formData = new FormData();

      formData.append("cv", file);

      /*
       * IMPORTANT:
       *
       * Do NOT set Content-Type here.
       *
       * The browser automatically creates:
       *
       * multipart/form-data;
       * boundary=....
       */

      const res = await fetch(
        "/api/analyse-cv",
        {
          method: "POST",
          body: formData,
        }
      );

      const text = await res.text();

      console.log(
        "ANALYSE CV RESPONSE:",
        text
      );

      let data: AnalysisResult;

      try {
        data = JSON.parse(text);
      } catch {
        setResult({
          error:
            text ||
            "The server returned an invalid response.",
        });

        return;
      }

      if (!res.ok) {
        setResult({
          error:
            data.error ||
            "The server returned an error.",
        });

        return;
      }

      console.log(
        "PARSED ANALYSIS:",
        data
      );

      console.log(
        "MODE:",
        data.mode
      );

      console.log(
        "ROLE EXISTS:",
        data.roleExists
      );

      console.log(
        "GAPS:",
        data.gaps
      );

      setResult(data);
    } catch (err) {
      console.error(err);

      setResult({
        error:
          err instanceof Error
            ? err.message
            : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  function updateAnswer(
    index: number,
    value: string
  ) {
    setAnswers((previous) => ({
      ...previous,
      [index]: value,
    }));
  }

  async function submitAssessment() {
    if (!result?.gaps?.length) {
      return;
    }

    /*
     * Make sure every question has an answer.
     */

    const unanswered =
      result.gaps.some(
        (_, index) =>
          !answers[index]?.trim()
      );

    if (unanswered) {
      setAssessmentResult({
        error:
          "Please answer every question before submitting the assessment.",
      });

      return;
    }

    setAssessing(true);
    setAssessmentResult(null);

    try {
      /*
       * IMPORTANT:
       *
       * There is NO userId here.
       *
       * The server obtains the actual logged-in
       * user's ID from the Auth.js session.
       */

      const assessmentPayload = {
        roleId:
          result.databaseRole?.id ??
          null,

        roleTitle:
          result.currentRole ?? "",

        questions:
          result.gaps.map(
            (gap, index) => ({
              competency:
                gap.competency,

              question:
                gap.question,

              answer:
                answers[index] ?? "",
            })
          ),
      };

      console.log(
        "SUBMITTING ASSESSMENT:",
        assessmentPayload
      );

      const res = await fetch(
        "/api/assess-cv",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            assessmentPayload
          ),
        }
      );

      const text = await res.text();

      console.log(
        "ASSESSMENT RESPONSE:",
        text
      );

      let data: AssessmentResponse;

      try {
        data = JSON.parse(text);
      } catch {
        setAssessmentResult({
          error:
            text ||
            "The assessment server returned an invalid response.",
        });

        return;
      }

      if (!res.ok) {
        setAssessmentResult({
          error:
            data.error ||
            "The assessment failed.",
        });

        return;
      }

      console.log(
        "ASSESSMENT RESULT:",
        data
      );

      setAssessmentResult(data);

      /*
       * Answers are removed from the React state
       * after submission.
       */

      setAnswers({});
    } catch (err) {
      console.error(err);

      setAssessmentResult({
        error:
          err instanceof Error
            ? err.message
            : "Unknown assessment error.",
      });
    } finally {
      setAssessing(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">

      {/* =================================================
          PAGE TITLE
          ================================================= */}

      <h1 className="mb-6 text-2xl font-bold">
        Upload CV
      </h1>

      {/* =================================================
          UPLOAD
          ================================================= */}

      <div className="rounded-lg border bg-white p-5">

        <label className="block text-sm font-medium text-slate-700">
          Upload CV
        </label>

        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => {
            if (e.target.files?.length) {
              upload(
                e.target.files[0]
              );
            }
          }}
          disabled={loading}
          className="mt-2 block w-full text-sm"
        />

        <p className="mt-2 text-sm text-slate-500">
          PDF and DOCX files are supported.
        </p>

        {loading && (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">

            <p className="font-medium text-slate-700">
              Analysing CV...
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Extracting competencies and
              comparing them with the
              knowledge database.
            </p>

          </div>
        )}

      </div>

      {/* =================================================
          ANALYSIS ERROR
          ================================================= */}

      {result?.error && (
        <div className="mt-6 rounded-lg bg-red-50 p-5 text-red-800">

          <h3 className="font-semibold">
            Error
          </h3>

          <p className="mt-2">
            {result.error}
          </p>

        </div>
      )}

      {/* =================================================
          RESULTS
          ================================================= */}

      {result && !result.error && (
        <div className="mt-8">

          {/* =================================================
              CANDIDATE
              ================================================= */}

          <div className="rounded-lg border bg-white p-5">

            {result.candidateName && (
              <h2 className="text-2xl font-semibold">
                {result.candidateName}
              </h2>
            )}

            {result.currentRole && (
              <p className="mt-1 text-slate-600">
                {result.currentRole}
              </p>
            )}

          </div>

          {/* =================================================
              NEW ROLE
              ================================================= */}

          {result.mode ===
            "capability_assessment" && (
            <div className="mt-6 rounded-lg bg-amber-50 p-5">

              <h3 className="text-lg font-semibold text-amber-900">
                New role
              </h3>

              <p className="mt-2 text-slate-700">
                This role was not found in
                the knowledge database.
              </p>

              {result.capabilitySummary && (
                <div className="mt-4 rounded-lg bg-white p-4">

                  <h4 className="font-semibold">
                    Capability assessment
                  </h4>

                  <p className="mt-2 text-slate-700">
                    {
                      result.capabilitySummary
                    }
                  </p>

                </div>
              )}

            </div>
          )}

          {/* =================================================
              EXISTING ROLE
              ================================================= */}

          {result.mode ===
            "comparison" && (
            <div className="mt-6 rounded-lg bg-blue-50 p-5">

              <h3 className="text-lg font-semibold text-blue-900">
                Existing role found
              </h3>

              <p className="mt-2 text-slate-700">
                The CV has been compared
                against the existing
                knowledge for this role.
              </p>

              {result.databaseRole && (
                <div className="mt-4 rounded-lg bg-white p-4">

                  <p className="font-semibold">
                    {
                      result.databaseRole
                        .name
                    }
                  </p>

                  {result.databaseRole
                    .jobTitle && (
                    <p className="mt-1 text-sm text-slate-500">
                      {
                        result.databaseRole
                          .jobTitle
                      }
                    </p>
                  )}

                  {result.databaseRole
                    .description && (
                    <p className="mt-2 text-sm text-slate-600">
                      {
                        result.databaseRole
                          .description
                      }
                    </p>
                  )}

                </div>
              )}

            </div>
          )}

          {/* =================================================
              COUNTS
              ================================================= */}

          {result.mode ===
            "comparison" && (
            <div className="mt-6 rounded-lg border bg-white p-5">

              <h3 className="mb-4 font-semibold">
                Assessment summary
              </h3>

              <div className="space-y-3">

                <div className="flex justify-between">
                  <span className="font-medium">
                    Database competencies
                  </span>

                  <span>
                    {
                      result
                        .databaseCompetencies
                        ?.length ?? 0
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-medium">
                    CV competencies
                  </span>

                  <span>
                    {
                      result.cvCompetencies
                        ?.length ?? 0
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-medium">
                    Matched competencies
                  </span>

                  <span>
                    {
                      result
                        .matchedCompetencies
                        ?.length ?? 0
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-medium">
                    Competency gaps
                  </span>

                  <span className="font-bold">
                    {
                      result.gaps
                        ?.length ?? 0
                    }
                  </span>
                </div>

              </div>

            </div>
          )}

          {/* =================================================
              QUESTIONS
              ================================================= */}

          {result.gaps &&
            result.gaps.length > 0 && (
            <div className="mt-8">

              <div className="mb-5">

                <h3 className="text-xl font-semibold">
                  Competency assessment
                </h3>

                <p className="mt-1 text-slate-600">
                  The following competencies
                  were not sufficiently
                  demonstrated by the CV.
                  Answer each question using
                  your own experience.
                </p>

                <p className="mt-2 text-sm font-medium text-slate-500">
                  Your answers are used to
                  assess the competency.
                </p>

              </div>

              <div className="space-y-6">

                {result.gaps.map(
                  (gap, index) => (
                    <div
                      key={`${gap.competency}-${index}`}
                      className="rounded-lg border bg-white p-5 shadow-sm"
                    >

                      <div className="flex items-start justify-between gap-4">

                        <h4 className="text-lg font-semibold">
                          {index + 1}.{" "}
                          {
                            gap.competency
                          }
                        </h4>

                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                          Gap
                        </span>

                      </div>

                      {gap.reason && (
                        <p className="mt-2 text-sm text-slate-600">
                          {gap.reason}
                        </p>
                      )}

                      <div className="mt-4 rounded-lg bg-slate-50 p-4">

                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Question
                        </p>

                        <p className="mt-2 text-slate-900">
                          {gap.question}
                        </p>

                      </div>

                      <div className="mt-4">

                        <label
                          htmlFor={`answer-${index}`}
                          className="block text-sm font-semibold text-slate-700"
                        >
                          Your answer
                        </label>

                        <textarea
                          id={`answer-${index}`}
                          value={
                            answers[index] ??
                            ""
                          }
                          onChange={(e) =>
                            updateAnswer(
                              index,
                              e.target.value
                            )
                          }
                          disabled={assessing}
                          rows={7}
                          placeholder="Describe what you did, your responsibilities, the situation, actions you took, and the result..."
                          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100"
                        />

                      </div>

                    </div>
                  )
                )}

              </div>

              {/* =================================================
                  SUBMIT
                  ================================================= */}

              <div className="mt-6 rounded-lg border bg-slate-50 p-5">

                <h4 className="font-semibold">
                  Complete assessment
                </h4>

                <p className="mt-1 text-sm text-slate-600">
                  Submit your answers to
                  assess the remaining
                  competency gaps.
                </p>

                <button
                  type="button"
                  onClick={
                    submitAssessment
                  }
                  disabled={assessing}
                  className="mt-4 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {assessing
                    ? "Assessing answers..."
                    : "Submit assessment"}
                </button>

              </div>

            </div>
          )}

          {/* =================================================
              ASSESSMENT ERROR
              ================================================= */}

          {assessmentResult?.error && (
            <div className="mt-6 rounded-lg bg-red-50 p-5 text-red-800">

              <h3 className="font-semibold">
                Assessment error
              </h3>

              <p className="mt-2">
                {
                  assessmentResult.error
                }
              </p>

            </div>
          )}

          {/* =================================================
              ASSESSMENT COMPLETE
              ================================================= */}

          {assessmentResult &&
            !assessmentResult.error && (
            <div className="mt-8">

              <div className="rounded-lg bg-green-50 p-5">

                <h3 className="text-xl font-semibold text-green-800">
                  Assessment complete
                </h3>

                <p className="mt-2 text-green-700">
                  The answers have been
                  assessed and demonstrated
                  competencies have been
                  added or updated.
                </p>

                {assessmentResult
                  .savedCompetencyCount !==
                  undefined && (
                  <p className="mt-3 font-semibold text-green-800">
                    Competencies updated:{" "}
                    {
                      assessmentResult
                        .savedCompetencyCount
                    }
                  </p>
                )}

              </div>

              {/* =================================================
                  SAVED COMPETENCIES
                  ================================================= */}

              {assessmentResult
                .savedCompetencies &&
                assessmentResult
                  .savedCompetencies
                  .length > 0 && (
                <div className="mt-8">

                  <h3 className="mb-4 text-xl font-semibold">
                    Newly demonstrated competencies
                  </h3>

                  <div className="space-y-3">

                    {assessmentResult
                      .savedCompetencies
                      .map(
                        (item, index) => (
                          <div
                            key={`${item.competency}-${index}`}
                            className="rounded-lg border bg-white p-4"
                          >

                            <div className="flex items-start justify-between gap-4">

                              <h4 className="font-semibold">
                                {
                                  item.competency
                                }
                              </h4>

                              <span className="text-sm font-medium text-slate-500">
                                {Math.round(
                                  item.confidence *
                                    100
                                )}
                                %
                              </span>

                            </div>

                            {item.evidence && (
                              <p className="mt-2 text-slate-600">
                                {
                                  item.evidence
                                }
                              </p>
                            )}

                          </div>
                        )
                      )}

                  </div>

                </div>
              )}

              {assessmentResult.message && (
                <p className="mt-6 text-sm text-slate-500">
                  {
                    assessmentResult.message
                  }
                </p>
              )}

            </div>
          )}

          {/* =================================================
              NO GAPS
              ================================================= */}

          {result.gaps &&
            result.gaps.length === 0 &&
            !assessmentResult && (
            <div className="mt-8 rounded-lg bg-green-50 p-5">

              <h3 className="text-lg font-semibold text-green-800">
                No competency gaps identified
              </h3>

              <p className="mt-2 text-green-700">
                No additional questions were
                generated from the assessment.
              </p>

            </div>
          )}

          {/* =================================================
              MATCHED COMPETENCIES
              ================================================= */}

          {result.mode ===
            "comparison" &&
            result.matchedCompetencies &&
            result.matchedCompetencies
              .length > 0 && (
            <div className="mt-8">

              <h3 className="mb-4 text-xl font-semibold">
                Matched knowledge
              </h3>

              <div className="space-y-3">

                {result.matchedCompetencies.map(
                  (item, index) => (
                    <div
                      key={`${item.competency}-${index}`}
                      className="rounded-lg border bg-white p-4"
                    >

                      <div className="flex justify-between gap-4">

                        <h4 className="font-semibold">
                          {
                            item.competency
                          }
                        </h4>

                        {typeof item.confidence ===
                          "number" && (
                          <span className="text-sm text-slate-500">
                            {Math.round(
                              item.confidence *
                                100
                            )}
                            %
                          </span>
                        )}

                      </div>

                      {item.evidence && (
                        <p className="mt-2 text-slate-600">
                          {item.evidence}
                        </p>
                      )}

                    </div>
                  )
                )}

              </div>

            </div>
          )}

          {/* =================================================
              NEW ROLE CV COMPETENCIES
              ================================================= */}

          {result.mode ===
            "capability_assessment" &&
            result.cvCompetencies &&
            result.cvCompetencies.length > 0 && (
            <div className="mt-8">

              <h3 className="mb-4 text-xl font-semibold">
                Identified competencies
              </h3>

              <div className="space-y-3">

                {result.cvCompetencies.map(
                  (item, index) => (
                    <div
                      key={`${item.competency}-${index}`}
                      className="rounded-lg border bg-white p-4"
                    >

                      <div className="flex justify-between gap-4">

                        <h4 className="font-semibold">
                          {
                            item.competency
                          }
                        </h4>

                        {typeof item.confidence ===
                          "number" && (
                          <span className="text-sm text-slate-500">
                            {Math.round(
                              item.confidence *
                                100
                            )}
                            %
                          </span>
                        )}

                      </div>

                      {item.evidence && (
                        <p className="mt-2 text-slate-600">
                          {item.evidence}
                        </p>
                      )}

                      {item.sourceSection && (
                        <p className="mt-2 text-sm text-slate-500">
                          Source:{" "}
                          {
                            item.sourceSection
                          }
                        </p>
                      )}

                    </div>
                  )
                )}

              </div>

            </div>
          )}

          {/* =================================================
              MESSAGE
              ================================================= */}

          {result.message && (
            <p className="mt-6 text-sm text-slate-500">
              {result.message}
            </p>
          )}

        </div>
      )}

    </main>
  );
}

