const PANEL_WIDTH = 400;

const SUBMISSION_REQUEST_FILTER = {
  urls: [
    "https://*.instructure.com/api/v1/courses/*/assignments/*/submissions*",
    "https://*.instructure.com/api/v1/courses/*/quizzes/*/submissions*",
    "https://*.instructure.com/api/v1/courses/*/discussion_topics/*/entries*",
    "https://*.instructure.com/courses/*/assignments/*/submissions*",
    "https://*.instructure.com/courses/*/quizzes/*/submissions*",
  ],
};

let notifyTimer = 0;

chrome.action.onClicked.addListener(() => {
  openRightPanel();
});

chrome.webRequest.onCompleted.addListener((details) => {
  if (details.statusCode >= 400) return;
  if (details.method !== "POST" && details.method !== "PUT") return;
  notifyCanvasSubmission();
}, SUBMISSION_REQUEST_FILTER);

chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  if (!isCanvasSubmissionPage(tab.url)) return;
  notifyCanvasSubmission();
});

chrome.windows.onRemoved.addListener(async (id) => {
  const stored = await chrome.storage.session.get("panelWindowId");
  if (stored.panelWindowId === id) {
    await chrome.storage.session.remove("panelWindowId");
  }
});

async function openRightPanel() {
  const stored = await chrome.storage.session.get("panelWindowId");
  if (stored.panelWindowId) {
    try {
      await chrome.windows.update(stored.panelWindowId, { focused: true });
      return;
    } catch {
      await chrome.storage.session.remove("panelWindowId");
    }
  }

  const bounds = await getRightDockBounds();
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    focused: true,
    width: PANEL_WIDTH,
    height: bounds.height,
    left: bounds.left,
    top: bounds.top,
  });

  if (win?.id != null) {
    await chrome.storage.session.set({ panelWindowId: win.id });
  }
}

async function getRightDockBounds() {
  let left = 10000;
  let top = 8;
  let height = 760;

  try {
    const displays = await chrome.system.display.getInfo();
    const area = (displays.find((display) => display.isPrimary) || displays[0])?.workArea;
    if (area) {
      height = Math.max(520, Math.min(area.height - 16, 840));
      left = area.left + area.width - PANEL_WIDTH;
      top = area.top + 8;
    }
  } catch {
    // Large left is clamped to the right edge when display info is unavailable.
  }

  return { left, top, height };
}

function isCanvasSubmissionPage(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("instructure.com")) return false;
    return /\/(assignments|quizzes|discussion_topics)\/\d+\/submissions(\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function notifyCanvasSubmission() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: "canvas-submitted" }, () => {
      void chrome.runtime.lastError;
    });
  }, 400);
}
