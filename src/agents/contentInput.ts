// ─── Content Input — unified abstraction for all text/file inputs ────────────

export type ContentInputType =
  | 'query'
  | 'long_text'
  | 'article'
  | 'file'
  | 'note'
  | 'transcript'
  | 'research';

export type ProcessingMode =
  | 'explain'
  | 'summarize'
  | 'analyze'
  | 'extract_insights'
  | 'extract_actions'
  | 'extract_sources';

export interface ContentInput {
  inputType:   ContentInputType;
  rawText:     string;
  userQuery?:  string;  // explicit instruction from user (e.g. file caption)
  fileName?:   string;
  mimeType?:   string;
  sourceName?: string;
}

export function buildContentInput(
  rawText: string,
  opts: Partial<Omit<ContentInput, 'rawText' | 'inputType'>> & { inputType?: ContentInputType } = {},
): ContentInput {
  let inputType: ContentInputType = opts.inputType ?? 'query';
  if (!opts.inputType) {
    if (opts.fileName)              inputType = 'file';
    else if (rawText.length > 1000) inputType = 'article';
    else if (rawText.length > 400)  inputType = 'long_text';
  }
  return { inputType, rawText, ...opts };
}
