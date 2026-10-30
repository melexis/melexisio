// Renders a Markdown help file into the #help-modal.
//
// The .md file is fetched at click time rather than inlined, so the document on
// disk stays the single source of truth and cannot drift from the GUI. This only
// works when the page is served over http(s) â€” which it already must be, because
// Web Serial requires a secure context. Opened straight off the filesystem the
// fetch is blocked and the modal says so rather than failing silently.

const HELP_SOURCE = 'sfi_help_readme.md';

// Escapes only the angle brackets. `&` is left alone on purpose: the help text
// uses entities such as `&plusmn;` and bare ampersands, both of which render
// correctly as-is.
function escapeHtml(text) {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline spans. Code spans are lifted out into placeholders first so that
// `**` or `*` inside a code span is never read as emphasis.
function renderInline(text) {
  const codeSpans = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, index) =>
    `<code>${escapeHtml(codeSpans[Number(index)])}</code>`);
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html = [];

  // Open lists, outermost first. Each level records the source indent that
  // opened it, so a dedent can pop back to the right depth, plus whether that
  // level still has an <li> waiting to be closed. Tracking the open item per
  // level (rather than one global flag) is what keeps the output balanced when
  // a sub-list nests inside its parent item.
  const listStack = [];
  let paragraph = [];

  const openList = (type, indent) => {
    listStack.push({ type, indent, itemOpen: false });
    html.push(`<${type}>`);
  };
  const closeItemOf = (level) => {
    if (level.itemOpen) {
      html.push('</li>');
      level.itemOpen = false;
    }
  };
  const closeListLevel = () => {
    const level = listStack.pop();
    closeItemOf(level);
    html.push(`</${level.type}>`);
  };
  const closeLists = () => {
    while (listStack.length) closeListLevel();
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (!line.trim()) {
      // A blank line only breaks the paragraph. The list stays open so that a
      // blank-separated indented sub-list still nests under its parent.
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeLists();
      flushParagraph();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (!paragraph.length && /^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeLists();
      html.push('<hr />');
      continue;
    }

    const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const indent = item[1].length;
      const type = /^\d+\.$/.test(item[2]) ? 'ol' : 'ul';
      const top = listStack[listStack.length - 1];

      if (!top) {
        openList(type, indent);
      } else if (indent > top.indent) {
        // Nested: the parent's <li> stays open and the sub-list goes inside it.
        openList(type, indent);
      } else {
        if (indent < top.indent) {
          closeItemOf(top);
          while (listStack.length > 1 && indent < listStack[listStack.length - 1].indent) {
            closeListLevel();
          }
        }
        const now = listStack[listStack.length - 1];
        if (now.type !== type) {
          closeItemOf(now);
          html.push(`</${now.type}>`);
          listStack.pop();
          openList(type, indent);
        }
      }

      // A level can only have one item open, so close the previous sibling
      // before starting the next one. On a dedent this is what closes the
      // parent item that the sub-list was nested inside.
      const level = listStack[listStack.length - 1];
      closeItemOf(level);
      html.push(`<li>${renderInline(item[3])}`);
      level.itemOpen = true;
      continue;
    }

    // Any other text ends the list â€” it is a new paragraph, not a loose item.
    closeLists();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeLists();
  return html.join('\n');
}

function initHelp() {
  const modal = document.getElementById('help-modal');
  const body = document.getElementById('help-body');
  const openBtn = document.getElementById('btn-open-help');
  if (!modal || !body || !openBtn) return;

  let loaded = false;
  let lastFocused = null;

  const close = () => {
    modal.classList.add('hidden');
    if (lastFocused) lastFocused.focus();
  };

  const load = async () => {
    if (loaded) return;
    body.innerHTML = `<div class="help-loading">Loading ${HELP_SOURCE}&hellip;</div>`;
    try {
      const response = await fetch(HELP_SOURCE, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body.innerHTML = renderMarkdown(await response.text());
      loaded = true;
    } catch (err) {
      body.innerHTML =
        `<div class="help-error"><strong>Could not load ${HELP_SOURCE}.</strong>` +
        '<br>The help file is fetched at runtime, so the page must be served over ' +
        'http://localhost or https:// &mdash; opening index.html directly from the ' +
        'filesystem blocks it.' +
        `<code>${escapeHtml(String(err))}</code></div>`;
    }
  };

  openBtn.addEventListener('click', async () => {
    lastFocused = document.activeElement;
    modal.classList.remove('hidden');
    document.getElementById('btn-close-help')?.focus();
    await load();
  });

  document.getElementById('btn-close-help')?.addEventListener('click', close);
  document.getElementById('help-backdrop')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHelp);
} else {
  initHelp();
}

