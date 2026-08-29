(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CustomTasks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const OTHER_COURSE_ID = "custom-other";
  const OTHER_COURSE_NAME = "Other";

  function isCustomTask(task) {
    if (!task || typeof task !== "object") return false;
    if (task.custom) return true;
    return String(task.id || "").startsWith("custom-");
  }

  function normalizeAssignmentUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(withProtocol);
      if (!/^https?:$/i.test(parsed.protocol)) return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function datetimeLocalToIso(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  function createCustomId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return `custom-${globalThis.crypto.randomUUID()}`;
    }
    return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createCustomTask({ title, url, courseId, course, dueAt }) {
    const trimmedTitle = String(title || "").trim();
    const href = normalizeAssignmentUrl(url);
    const resolvedCourseId = String(courseId || OTHER_COURSE_ID);
    const resolvedCourse = String(course || "").trim() || OTHER_COURSE_NAME;

    return {
      id: createCustomId(),
      title: trimmedTitle || "Untitled",
      course: resolvedCourse,
      courseId: resolvedCourseId,
      dueAt: dueAt || null,
      url: href,
      pointsPossible: null,
      submitted: false,
      custom: true,
    };
  }

  function validateCustomAssignment({ title, url, courseId, dueAt }) {
    const errors = [];
    const trimmedTitle = String(title || "").trim();
    if (!trimmedTitle) errors.push("Enter a title.");

    const href = normalizeAssignmentUrl(url);
    if (!href) errors.push("Enter a valid link.");

    const resolvedCourseId = String(courseId || "").trim();
    if (!resolvedCourseId) errors.push("Select a class.");

    let isoDue = null;
    if (String(dueAt || "").trim()) {
      isoDue = datetimeLocalToIso(dueAt);
      if (!isoDue) errors.push("Enter a valid due date.");
    }

    if (errors.length) {
      return { ok: false, errors, value: null };
    }

    return {
      ok: true,
      errors: [],
      value: {
        title: trimmedTitle,
        url: href,
        courseId: resolvedCourseId,
        dueAt: isoDue,
      },
    };
  }

  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
      const aTime = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
      const bTime = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  function mergeTasks(canvasTasks, customTasks) {
    const canvas = Array.isArray(canvasTasks) ? canvasTasks : [];
    const custom = Array.isArray(customTasks) ? customTasks.filter(isCustomTask) : [];
    const seen = new Set(canvas.map((task) => task.id));
    const extras = custom.filter((task) => !seen.has(task.id));
    return sortTasks([...canvas, ...extras]);
  }

  function removeCustomTask(customTasks, id) {
    return (customTasks || []).filter((task) => task.id !== id);
  }

  function hydrateCustomTasks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((task) => isCustomTask(task) && String(task.title || "").trim())
      .map((task) => ({
        id: String(task.id),
        title: String(task.title).trim(),
        course: String(task.course || OTHER_COURSE_NAME).trim() || OTHER_COURSE_NAME,
        courseId: String(task.courseId || OTHER_COURSE_ID),
        dueAt: task.dueAt || null,
        url: normalizeAssignmentUrl(task.url),
        pointsPossible: null,
        submitted: false,
        custom: true,
      }))
      .filter((task) => task.url);
  }

  function collectCourses(canvasCourses, tasks) {
    const courses = new Map();
    for (const course of canvasCourses || []) {
      const id = String(course.id || "");
      const name = String(course.name || "").trim();
      if (id && name) courses.set(id, name);
    }
    for (const task of tasks || []) {
      const id = String(task.courseId || task.course || "");
      const name = String(task.course || "").trim();
      if (id && name && !courses.has(id)) courses.set(id, name);
    }
    if (!courses.size) {
      courses.set(OTHER_COURSE_ID, OTHER_COURSE_NAME);
    }
    return courses;
  }

  return {
    OTHER_COURSE_ID,
    OTHER_COURSE_NAME,
    isCustomTask,
    normalizeAssignmentUrl,
    datetimeLocalToIso,
    createCustomId,
    createCustomTask,
    validateCustomAssignment,
    sortTasks,
    mergeTasks,
    removeCustomTask,
    hydrateCustomTasks,
    collectCourses,
  };
});
