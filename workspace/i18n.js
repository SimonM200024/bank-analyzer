import { sl } from "./si.js";
export class DisplayValue extends String {}
const patterns = Object.entries(sl)
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.length - a.length)
  .map(([key, translation]) => ({
    expression: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("(.*?)") +
        "$",
    ),
    translation,
  }));
let language = "en";
try {
  const requested = new URLSearchParams(globalThis.location?.search || "").get(
    "lang",
  );
  const saved = globalThis.document
    ? globalThis.localStorage?.getItem("aw-language")
    : null;
  language = ["si", "sl"].includes(requested || saved)
    ? "si"
    : (requested || saved) === "en"
      ? "en"
      : globalThis.navigator?.language?.startsWith("sl")
        ? "si"
        : "en";
} catch {}
export const getLanguage = () => language;
export const locale = () => (language === "si" ? "sl-SI" : "en-GB");
export function setLanguage(value) {
  language = value === "si" || value === "sl" ? "si" : "en";
  try {
    if (globalThis.document)
      globalThis.localStorage?.setItem("aw-language", language);
  } catch {}
  if (globalThis.location && globalThis.history) {
    const url = new URL(location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", language);
      history.replaceState(null, "", url);
    }
  }
  if (globalThis.document)
    document.documentElement.lang = language === "si" ? "sl" : "en";
}
setLanguage(language);
export function tr(value, ...args) {
  const text = String(value ?? "");
  const normalized = text.replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
  let translated =
    language === "si" ? (sl[normalized] ?? normalized) : normalized;
  if (language === "si" && sl[normalized] === undefined) {
    for (const { expression, translation } of patterns) {
      const match = normalized.match(expression);
      if (match) {
        translated = translation.replace(
          /\{(\d+)\}/g,
          (_, index) => match[Number(index) + 1],
        );
        break;
      }
    }
  }
  return (text.match(/^\s*/)[0] + translated + text.match(/\s*$/)[0]).replace(
    /\{(\d+)\}/g,
    (whole, index) => (args[index] === undefined ? whole : String(args[index])),
  );
}
function textPart(text, values) {
  const tokens = [];
  const key = text.replace(/\uE000(\d+)\uE001/g, (token, index) => {
    tokens.push({ token, index: Number(index) });
    return `{${tokens.length - 1}}`;
  });
  const normalized = key.replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
  let result =
    language === "si" && sl[normalized] !== undefined
      ? text.match(/^\s*/)[0] + sl[normalized] + text.match(/\s*$/)[0]
      : key
          .split(/(\uE000\d+\uE001|\{\d+\})/g)
          .map((part) => (/^\{\d+\}$/.test(part) ? part : tr(part)))
          .join("");
  result = result.replace(
    /\{(\d+)\}/g,
    (whole, n) => tokens[n]?.token ?? whole,
  );
  return result.replace(/\uE000(\d+)\uE001/g, (whole, index) => {
    const value = values[index];
    // Escaped record values are protected; only explicitly supplied UI labels translate.
    if (
      value instanceof DisplayValue ||
      typeof value !== "string" ||
      value.includes("<")
    )
      return whole;
    values[index] = tr(value);
    return whole;
  });
}
export function html(strings, ...values) {
  const template = strings.reduce(
    (out, part, index) =>
      out + (index ? `\uE000${index - 1}\uE001` : "") + part,
    "",
  );
  return renderMarkup(template, values);
}
function renderMarkup(template, values) {
  const result = template
    .split(/(<[^>]*>)/g)
    .map((part) =>
      part.startsWith("<")
        ? part.replace(
            /\b(aria-label|placeholder|title|alt)="([^"]*)"/g,
            (_, attr, value) => `${attr}="${textPart(value, values)}"`,
          )
        : textPart(part, values),
    )
    .join("");
  return result.replace(/\uE000(\d+)\uE001/g, (_, index) =>
    String(values[index] ?? ""),
  );
}
export const markup = (text) => renderMarkup(text, []);
export function languagePicker() {
  return `<label class="language-picker"><span class="sr-label">Language / Jezik</span><select data-language aria-label="Language / Jezik"><option value="si"${language === "si" ? " selected" : ""}>SI · Slovenščina</option><option value="en"${language === "en" ? " selected" : ""}>EN · English</option></select></label>`;
}
