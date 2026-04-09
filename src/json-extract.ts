export function extractLastJSONObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let lastObject: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }

    if (ch === "}") {
      if (depth === 0) {
        continue;
      }
      depth--;
      if (depth === 0 && start >= 0) {
        lastObject = text.slice(start, i + 1);
        start = -1;
      }
    }
  }

  return lastObject;
}
