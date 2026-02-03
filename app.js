/* copy-panels — Slim white UI
   - 4 stacked rich editors (contenteditable)
   - formatting: font, size, bold/italic/underline, bullets, alignment, clear
   - COPY copies HTML + plain-text fallback (Outlook-friendly)
   - No persistence (refresh clears)
   - Default text black
*/

const PANEL_COUNT = 4;

const FONT_OPTIONS = [
  { label: "Segoe UI (Outlook)", value: "Segoe UI" },
  { label: "Arial", value: "Arial" },
  { label: "Calibri", value: "Calibri" },
  { label: "Verdana", value: "Verdana" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
];

const SIZE_OPTIONS = [
  { label: "12 px", px: 12 },
  { label: "14 px", px: 14 },
  { label: "16 px", px: 16 },
  { label: "18 px", px: 18 },
  { label: "20 px", px: 20 },
  { label: "24 px", px: 24 },
  { label: "28 px", px: 28 },
  { label: "32 px", px: 32 },
];

const panelsEl = document.getElementById("panels");
const toastEl = document.getElementById("toast");

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toastEl.classList.remove("show"), 1200);
}

// Prefer CSS inline formatting where supported
try { document.execCommand("styleWithCSS", false, true); } catch (_) {}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  children.forEach(c => node.appendChild(c));
  return node;
}

function sanitizeForEmail(innerHtml) {
  // Keep black as base; let the editor set font/size styles.
  // Wrap so Outlook keeps a consistent base if some parts are unstyled.
  return `
<div style="font-family: Segoe UI, Arial, sans-serif; color:#000;">
${innerHtml}
</div>`.trim();
}

function htmlToPlainText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.innerText;
}

function selectionInside(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer);
}

function focusEditor(editor) {
  editor.focus();
  if (editor.innerHTML.trim() === "") {
    editor.innerHTML = "<div><br></div>";
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function exec(editor, command, value = null) {
  if (!selectionInside(editor)) focusEditor(editor);
  try { document.execCommand(command, false, value); } catch (_) {}
  editor.focus();
}

function applyFont(editor, fontName) {
  exec(editor, "fontName", fontName);
}

function applyAlign(editor, align) {
  const map = { left:"justifyLeft", center:"justifyCenter", right:"justifyRight", justify:"justifyFull" };
  exec(editor, map[align] || "justifyLeft");
}

function applyBullets(editor) {
  exec(editor, "insertUnorderedList");
}

function clearFormatting(editor) {
  exec(editor, "removeFormat");
  // Re-force black base after clear
  editor.querySelectorAll("*").forEach(n => {
    if (n.style && n.style.color) n.style.color = "#000";
  });
}

function applyFontSizePx(editor, px) {
  // Map px to legacy 1–7, then normalize to spans with px for Outlook reliability.
  const bucket = px <= 12 ? 2
               : px <= 14 ? 3
               : px <= 16 ? 4
               : px <= 18 ? 5
               : px <= 24 ? 6
               : 7;

  exec(editor, "fontSize", String(bucket));
  normalizeFontTags(editor, px);
}

function normalizeFontTags(editor, px) {
  const fonts = editor.querySelectorAll("font[size]");
  fonts.forEach(f => {
    const span = document.createElement("span");
    span.style.fontSize = `${px}px`;

    const face = f.getAttribute("face");
    if (face) span.style.fontFamily = face;

    // Force black always
    span.style.color = "#000";

    span.innerHTML = f.innerHTML;
    f.replaceWith(span);
  });

  // Also force any inline color to black (you said all text will be black)
  editor.querySelectorAll("*").forEach(n => {
    if (n.style) n.style.color = "#000";
  });
}

async function copyRich(editor) {
  // Ensure black everywhere
  editor.querySelectorAll("*").forEach(n => {
    if (n.style) n.style.color = "#000";
  });

  const raw = editor.innerHTML.trim();
  const html = sanitizeForEmail(raw === "" ? "<div></div>" : raw);
  const text = htmlToPlainText(html);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      });
      await navigator.clipboard.write([item]);
      showToast("Copied ✅");
      return;
    }
  } catch (_) {
    // fallback
  }

  // Fallback: select editor contents and execCommand copy
  try {
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("copy");
    sel.removeAllRanges();
    showToast("Copied ✅");
  } catch (_) {
    showToast("Copy failed — try Ctrl/Cmd+C");
  }
}

function buildPanel(i) {
  const idx = i + 1;

  const editor = el("div", {
    class: "editor",
    contenteditable: "true",
    spellcheck: "true",
    "data-editor": String(idx),
    html: `<div style="font-family: Segoe UI, Arial, sans-serif; font-size:14px; color:#000;">
      Panel ${idx} — type here…
    </div>`
  });

  // Controls
  const fontSelect = el("select", { class: "control" });
  FONT_OPTIONS.forEach(opt => fontSelect.appendChild(el("option", { value: opt.value, html: opt.label })));
  fontSelect.value = "Segoe UI";
  fontSelect.addEventListener("change", () => applyFont(editor, fontSelect.value));

  const sizeSelect = el("select", { class: "control small" });
  SIZE_OPTIONS.forEach(opt => sizeSelect.appendChild(el("option", { value: String(opt.px), html: opt.label })));
  sizeSelect.value = "14";
  sizeSelect.addEventListener("change", () => applyFontSizePx(editor, Number(sizeSelect.value)));

  const btnB = el("button", { class: "btn icon", type: "button", title: "Bold", html: "B" });
  btnB.addEventListener("click", () => exec(editor, "bold"));

  const btnI = el("button", { class: "btn icon", type: "button", title: "Italic", html: "I" });
  btnI.addEventListener("click", () => exec(editor, "italic"));

  const btnU = el("button", { class: "btn icon", type: "button", title: "Underline", html: "U" });
  btnU.addEventListener("click", () => exec(editor, "underline"));

  const btnBul = el("button", { class: "btn", type: "button", title: "Bullets", html: "• List" });
  btnBul.addEventListener("click", () => applyBullets(editor));

  const btnLeft = el("button", { class: "btn icon", type: "button", title: "Align left", html: "⟸" });
  btnLeft.addEventListener("click", () => applyAlign(editor, "left"));

  const btnCenter = el("button", { class: "btn icon", type: "button", title: "Align center", html: "≡" });
  btnCenter.addEventListener("click", () => applyAlign(editor, "center"));

  const btnRight = el("button", { class: "btn icon", type: "button", title: "Align right", html: "⟹" });
  btnRight.addEventListener("click", () => applyAlign(editor, "right"));

  const btnClear = el("button", { class: "btn", type: "button", title: "Clear formatting", html: "Clear" });
  btnClear.addEventListener("click", () => clearFormatting(editor));

  const copyBtn = el("button", { class: "copyBig", type: "button", html: "COPY" });
  copyBtn.addEventListener("click", () => copyRich(editor));

  const panel = el("article", { class: "panel" }, [
    el("div", { class: "panelHead" }, [
      el("div", { class: "title" }, [
        el("div", { class: "badge", html: String(idx) }),
        el("h2", { html: `Panel ${idx}` })
      ])
    ]),
    el("div", { class: "tools" }, [
      fontSelect, sizeSelect,
      btnB, btnI, btnU,
      btnBul,
      btnLeft, btnCenter, btnRight,
      btnClear
    ]),
    el("div", { class: "editorRow" }, [
      editor,
      copyBtn
    ])
  ]);

  return panel;
}

function init() {
  panelsEl.innerHTML = "";
  for (let i = 0; i < PANEL_COUNT; i++) {
    panelsEl.appendChild(buildPanel(i));
  }
}

init();
