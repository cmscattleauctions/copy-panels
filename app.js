/* 4-Panel Rich Copy Tool
   - contenteditable rich areas
   - toolbar (font/size/color/basic formatting)
   - copy as HTML + plain text fallback (good for Outlook)
   - no persistence (refresh clears)
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
  showToast._t = window.setTimeout(() => toastEl.classList.remove("show"), 1400);
}

// Ensure execCommand uses CSS styles where possible
try {
  document.execCommand("styleWithCSS", false, true);
} catch (_) { /* ignore */ }

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

function sanitizeForEmail(html) {
  // Outlook is generally fine with inline styles.
  // Wrap in a container to keep consistent base font if user leaves parts unstyled.
  // (The user can still override with toolbar.)
  return `
<div style="font-family: Segoe UI, Arial, sans-serif;">
${html}
</div>`.trim();
}

function htmlToPlainText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.innerText;
}

function clampSelectionToEditor(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer);
}

function focusEditor(editor) {
  editor.focus();
  // If editor is empty, place caret inside
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
  // Only apply command if selection is inside editor; otherwise focus editor first
  if (!clampSelectionToEditor(editor)) focusEditor(editor);

  try {
    document.execCommand(command, false, value);
  } catch (_) {
    // execCommand can fail in some locked-down contexts; ignore gracefully
  }
  editor.focus();
}

function applyFont(editor, fontName) {
  exec(editor, "fontName", fontName);
}

function applyColor(editor, hexColor) {
  exec(editor, "foreColor", hexColor);
}

function applyAlign(editor, align) {
  // align: left|center|right|justify
  const map = {
    left: "justifyLeft",
    center: "justifyCenter",
    right: "justifyRight",
    justify: "justifyFull"
  };
  exec(editor, map[align] || "justifyLeft");
}

function applyBullets(editor) {
  exec(editor, "insertUnorderedList");
}

function clearFormatting(editor) {
  exec(editor, "removeFormat");
}

function applyFontSizePx(editor, px) {
  // execCommand supports fontSize 1-7. We'll map to 1-7 then normalize to px.
  const bucket = px <= 12 ? 2
               : px <= 14 ? 3
               : px <= 16 ? 4
               : px <= 18 ? 5
               : px <= 24 ? 6
               : 7;

  exec(editor, "fontSize", String(bucket));

  // Normalize any <font size="..."> to <span style="font-size:XXpx">
  // This improves Outlook reliability.
  normalizeFontTags(editor, px);
}

function normalizeFontTags(editor, px) {
  const fonts = editor.querySelectorAll("font[size]");
  fonts.forEach(f => {
    const span = document.createElement("span");
    span.style.fontSize = `${px}px`;

    // Preserve color/face if present (some browsers use these attrs)
    const face = f.getAttribute("face");
    if (face) span.style.fontFamily = face;
    const color = f.getAttribute("color");
    if (color) span.style.color = color;

    span.innerHTML = f.innerHTML;
    f.replaceWith(span);
  });
}

async function copyRich(editor) {
  const rawHtml = editor.innerHTML.trim();
  const html = sanitizeForEmail(rawHtml === "" ? "<div></div>" : rawHtml);
  const text = htmlToPlainText(html);

  // Prefer async clipboard with both text/html and text/plain
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      });
      await navigator.clipboard.write([item]);
      showToast("Copied with formatting ✅");
      return;
    }
  } catch (_) {
    // fallback below
  }

  // Fallback: select editor contents then execCommand('copy')
  // This usually preserves formatting when pasting into Outlook.
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
    html: `<div style="font-family: Segoe UI, Arial, sans-serif; font-size: 14px;">
      <b>Panel ${idx}</b> — type here…
    </div>`
  });

  // Controls
  const fontSelect = el("select", { class: "control" });
  FONT_OPTIONS.forEach(opt => {
    fontSelect.appendChild(el("option", { value: opt.value, html: opt.label }));
  });
  fontSelect.value = "Segoe UI";
  fontSelect.addEventListener("change", () => applyFont(editor, fontSelect.value));

  const sizeSelect = el("select", { class: "control small" });
  SIZE_OPTIONS.forEach(opt => {
    sizeSelect.appendChild(el("option", { value: String(opt.px), html: opt.label }));
  });
  sizeSelect.value = "14";
  sizeSelect.addEventListener("change", () => applyFontSizePx(editor, Number(sizeSelect.value)));

  const colorInput = el("input", { class: "control color", type: "color", value: "#e8eefc" });
  colorInput.addEventListener("input", () => applyColor(editor, colorInput.value));

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

  const copyBtn = el("button", { class: "btn copy", type: "button", html: "COPY" });
  copyBtn.addEventListener("click", () => copyRich(editor));

  const panel = el("article", { class: "panel" }, [
    el("div", { class: "panelHead" }, [
      el("div", { class: "title" }, [
        el("div", { class: "badge", html: String(idx) }),
        el("div", {}, [
          el("h2", { html: `Panel ${idx}` }),
          el("span", { html: "Rich text editor (Outlook-friendly copy)" })
        ])
      ])
    ]),
    el("div", { class: "tools" }, [
      fontSelect, sizeSelect, colorInput,
      btnB, btnI, btnU,
      btnBul,
      btnLeft, btnCenter, btnRight,
      btnClear
    ]),
    el("div", { class: "editorWrap" }, [
      editor,
      el("div", { class: "hint", html: "Tip: Click inside the editor first, then use the toolbar for best results." })
    ]),
    el("div", { class: "panelFoot" }, [ copyBtn ])
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

