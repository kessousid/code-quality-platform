/**
 * Gemini is instructed not to wrap its answer in a markdown code fence,
 * but instructions to LLMs are a strong hint, not a guarantee — this
 * strips one if present, in either of the two shapes actually observed:
 * the whole response is one fence, or there's leading prose before it.
 */
export function extractCode(rawResponseText: string): string {
  const trimmed = rawResponseText.trim();

  const wholeResponseFence = trimmed.match(/^```(?:[a-zA-Z]+)?\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (wholeResponseFence) {
    return `${wholeResponseFence[1]!.trim()}\n`;
  }

  const fenceAnywhere = trimmed.match(/```(?:[a-zA-Z]+)?\r?\n([\s\S]*?)```/);
  if (fenceAnywhere) {
    return `${fenceAnywhere[1]!.trim()}\n`;
  }

  return `${trimmed}\n`;
}
