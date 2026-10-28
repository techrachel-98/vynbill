export const KEY_HEADER = "x-user-api-key";

// Format check only: stops obviously wrong input early. Anthropic still decides if a key is valid.
export function isPlausibleApiKey(value) {
  return typeof value === "string" && /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(value.trim());
}
