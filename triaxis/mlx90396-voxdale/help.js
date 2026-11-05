// Renders a Markdown help file, either into the docked #help-panel on the demo
// page (index.html) or as the whole page in its own window (help.html).
//
// The panel is deliberately not modal: the page stays usable next to it, so
// the presenter can read a step and do it at the same time. "Open in new
// window" moves the help to help.html for a second screen and closes the panel
// so the demo gets its full width back.
//
// The .md file is fetched at click time rather than inlined, so the document on
// disk stays the single source of truth and cannot drift from the GUI. This only
// works when the page is served over http(s) - which it already must be, because
// Web Serial requires a secure context. Opened straight off the filesystem the
// fetch is blocked and the panel says so rather than failing silently.

const HELP_SOURCE = 'sfi_help_readme.md';
const HELP_WINDOW_URL = 'help.html';
// A fixed name makes a second click reuse (and raise) the same window.
const HELP_WINDOW_NAME = 'mlx90396-sfi-help';

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

    // Any other text ends the list - it is a new paragraph, not a loose item.
    closeLists();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeLists();
  return html.join('\n');
}

// Fetches and renders the help into `body`. Resolves true once it rendered.
async function loadHelp(body) {
  body.innerHTML = `<div class="help-loading">Loading ${HELP_SOURCE}&hellip;</div>`;
  try {
    const response = await fetch(HELP_SOURCE, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    body.innerHTML = renderMarkdown(await response.text());
    return true;
  } catch (err) {
    body.innerHTML =
      `<div class="help-error"><strong>Could not load ${HELP_SOURCE}.</strong>` +
      '<br>The help file is fetched at runtime, so the page must be served over ' +
      'http://localhost or https:// &mdash; opening the page directly from the ' +
      'filesystem blocks it.' +
      `<code>${escapeHtml(String(err))}</code></div>`;
    return false;
  }
}

function initHelpPanel(body) {
  const panel = document.getElementById('help-panel');
  const openBtn = document.getElementById('btn-open-help');
  if (!panel || !openBtn) return;

  let loaded = false;
  const isOpen = () => !panel.classList.contains('hidden');

  const setOpen = (open) => {
    panel.classList.toggle('hidden', !open);
    document.body.classList.toggle('help-open', open);
    openBtn.setAttribute('aria-expanded', String(open));
    // The page just got narrower or wider: let the canvases and fitted views
    // follow straight away.
    window.dispatchEvent(new Event('resize'));
  };

  // The Help button toggles, so the same button that opened it closes it.
  openBtn.addEventListener('click', async () => {
    const open = !isOpen();
    setOpen(open);
    if (open && !loaded) loaded = await loadHelp(body);
  });

  document.getElementById('btn-close-help')?.addEventListener('click', () => setOpen(false));

  document.getElementById('btn-popout-help')?.addEventListener('click', () => {
    const win = window.open(HELP_WINDOW_URL, HELP_WINDOW_NAME, 'popup,width=760,height=900');
    // Blocked pop-up: keep the panel rather than leave the user with nothing.
    if (!win) return;
    win.focus();
    setOpen(false);
  });

  // Escape closes the panel, but not while typing in a field on the page.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (e.target.closest?.('input, select, textarea')) return;
    setOpen(false);
  });
}

function initHelp() {
  const body = document.getElementById('help-body');
  if (!body) return;
  // help.html: the help is the whole page, so render it straight away.
  if ('standalone' in body.dataset) {
    loadHelp(body);
    return;
  }
  initHelpPanel(body);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHelp);
} else {
  initHelp();
}
