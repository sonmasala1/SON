// One-time JSX migration, also reusable for new screens. Preview with no flags; apply with --write.
// Only visible text and accessible text props are changed. Form values, routes, keys, IDs and handlers stay intact.
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@babel/parser");
const root = path.resolve(__dirname, "../src");
const skip = new Set([
  "LocaleProvider.jsx",
  "LocalizedText.jsx",
  "LanguageToggle.jsx",
  "Icon.jsx",
  "layout.jsx",
  "global-error.jsx",
]);
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name))
        : entry.name.endsWith(".jsx") && !skip.has(entry.name)
          ? [path.join(dir, entry.name)]
          : [],
    );
}
const attributes = new Set([
  "aria-label",
  "placeholder",
  "title",
  "alt",
  "lang",
]);
for (const file of files(root)) {
  const source = fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
  if (source.includes("from '@/components/LocalizedText'")) continue;
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const edits = [];
  function walk(node, parent, context = {}) {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXElement") {
      const name = node.openingElement.name.name;
      if (name === "script" || name === "style") return;
      const untranslatable = node.openingElement.attributes.some(
        (attr) => attr.name?.name === "translate" && attr.value?.value === "no",
      );
      if (untranslatable) return;
      if (
        name === "option" &&
        !node.openingElement.attributes.some(
          (attr) => attr.name?.name === "value",
        )
      ) {
        const child = node.children.find(
          (child) => child.type !== "JSXText" || child.value.trim(),
        );
        const value =
          child?.type === "JSXExpressionContainer"
            ? source.slice(child.expression.start, child.expression.end)
            : JSON.stringify(child?.value?.trim() || "");
        edits.push([node.openingElement.name.end, ` value={${value}}`]);
      }
      if (
        node.openingElement.attributes.some((attr) =>
          attributes.has(attr.name?.name),
        )
      ) {
        const key = node.openingElement.attributes.find(
          (attr) => attr.name?.name === "key",
        );
        edits.push(
          [
            node.start,
            `<LocalizedAttrs${key ? " " + source.slice(key.start, key.end) : ""}>`,
          ],
          [node.end, "</LocalizedAttrs>"],
        );
      }
    }
    if (node.type === "JSXText" && /[A-Za-z\u0900-\u097f]/u.test(node.value)) {
      const lines = node.value.replace(/\r/g, "").split("\n");
      const text = lines
        .map((line, index) => {
          let result = line.replace(/\t/g, " ");
          if (index) result = result.replace(/^ +/, "");
          if (index < lines.length - 1) result = result.replace(/ +$/, "");
          return result;
        })
        .filter(Boolean)
        .join(" ");
      if (text.trim())
        edits.push([
          node.start,
          `<Text>${JSON.stringify(text).replace(/</g, "\\u003c").replace(/^/, "{").replace(/$/, "}")}</Text>`,
          node.end,
        ]);
      return;
    }
    if (
      node.type === "JSXExpressionContainer" &&
      parent &&
      ["JSXElement", "JSXFragment"].includes(parent.type)
    ) {
      const expression = node.expression;
      if (
        expression.type !== "JSXEmptyExpression" &&
        !["JSXElement", "JSXFragment"].includes(expression.type)
      ) {
        const raw = source.slice(expression.start, expression.end);
        // Customer-entered identity/contact/review text is preserved as authored, never translated by a phrase match.
        const personal =
          /^(?:user\??\.(?:name|email|phone)\b|delivery\.|order\.delivery\.|review\.(?:comment|displayName)\b|account\.(?:fullName|email|phone)\b)/.test(
            raw,
          );
        if (!personal)
          edits.push(
            [
              node.start,
              `<Text${/\b(?:error|wishlistError)\b/.test(raw) ? " error" : ""}>`,
            ],
            [node.end, "</Text>"],
          );
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key))
        continue;
      if (Array.isArray(child))
        child.forEach((value) => {
          if (value?.type) walk(value, node, context);
        });
      else if (child?.type) walk(child, node, context);
    }
  }
  walk(ast);
  if (!edits.length) continue;
  // Apply right-to-left. For identical offsets, close an inner wrapper before its outer wrapper.
  edits.sort(
    (a, b) =>
      b[0] - a[0] ||
      (b[2] ?? b[0]) - (a[2] ?? a[0]) ||
      Number(a[1].startsWith("</")) - Number(b[1].startsWith("</")),
  );
  let output = source;
  for (const [start, replacement, end = start] of edits)
    output = output.slice(0, start) + replacement + output.slice(end);
  const importAt = output.startsWith("'use client';")
    ? output.indexOf("\n") + 1
    : output.startsWith('"use client";')
      ? output.indexOf("\n") + 1
      : output.charCodeAt(0) === 0xfeff
        ? 1
        : 0;
  output =
    output.slice(0, importAt) +
    "import { Text, LocalizedAttrs } from '@/components/LocalizedText';\n" +
    output.slice(importAt);
  try {
    parse(output, { sourceType: "module", plugins: ["jsx"] });
  } catch (error) {
    const errorPath = path.resolve(
      root,
      "../../backend/.runtime/localize-error.jsx",
    );
    fs.mkdirSync(path.dirname(errorPath), { recursive: true });
    fs.writeFileSync(errorPath, output);
    throw error;
  }
  if (process.argv.includes("--write")) fs.writeFileSync(file, output);
  console.log(path.relative(root, file));
}
