const DEFAULT_ORIGIN = "https://oklahomachristian.instructure.com";

const STORAGE_KEYS = {
  completedIds: "completedIds",
  inProgressIds: "inProgressIds",
  reviewIds: "reviewIds",
  hideCompleted: "hideCompleted",
  canvasOrigin: "canvasOrigin",
  courseFilter: "courseFilter",
  customTasks: "customTasks",
};

const ASSIGNMENT_TYPES = new Set(["assignment", "quiz", "discussion_topic"]);

const els = {
  refreshBtn: document.getElementById("refresh-btn"),
  originForm: document.getElementById("origin-form"),
  originInput: document.getElementById("origin-input"),
  hideCompleted: document.getElementById("hide-completed"),
  courseFilter: document.getElementById("course-filter"),
  schoolLabel: document.getElementById("school-label"),
  status: document.getElementById("status"),
  taskList: document.getElementById("task-list"),
  confettiCanvas: document.getElementById("confetti-canvas"),
  progressCard: document.getElementById("progress-card"),
  progressDone: document.getElementById("progress-done"),
  progressReview: document.getElementById("progress-review"),
  progressActive: document.getElementById("progress-active"),
  progressLeft: document.getElementById("progress-left"),
  progressFillDone: document.getElementById("progress-fill-done"),
  progressFillReview: document.getElementById("progress-fill-review"),
  progressFillActive: document.getElementById("progress-fill-active"),
  customForm: document.getElementById("custom-form"),
  customTitle: document.getElementById("custom-title"),
  customUrl: document.getElementById("custom-url"),
  customCourse: document.getElementById("custom-course"),
  customDue: document.getElementById("custom-due"),
  customError: document.getElementById("custom-error"),
  customDetails: document.querySelector(".custom-details"),
};

const state = {
  origin: DEFAULT_ORIGIN,
  tasks: [],
  canvasTasks: [],
  customTasks: [],
  courses: [],
  completedIds: new Set(),
  inProgressIds: new Set(),
  reviewIds: new Set(),
  hideCompleted: false,
  courseFilter: "all",
};

let loadGeneration = 0;
let refreshTimer = 0;
let confettiFrame = 0;
let confettiPieces = [];

document.addEventListener("DOMContentLoaded", init);

els.originForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const origin = normalizeOrigin(els.originInput.value) || DEFAULT_ORIGIN;
  els.originInput.value = origin;
  await loadTasks(origin);
});

els.refreshBtn.addEventListener("click", async () => {
  const origin = normalizeOrigin(els.originInput.value) || state.origin || DEFAULT_ORIGIN;
  els.originInput.value = origin;
  await loadTasks(origin);
});

els.hideCompleted.addEventListener("change", async () => {
  state.hideCompleted = els.hideCompleted.checked;
  await chrome.storage.local.set({ [STORAGE_KEYS.hideCompleted]: state.hideCompleted });
  renderTasks();
});

els.courseFilter.addEventListener("change", async () => {
  state.courseFilter = els.courseFilter.value || "all";
  await chrome.storage.local.set({ [STORAGE_KEYS.courseFilter]: state.courseFilter });
  renderTasks();
});

els.customForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addCustomAssignment();
});

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.completedIds,
    STORAGE_KEYS.inProgressIds,
    STORAGE_KEYS.reviewIds,
    STORAGE_KEYS.hideCompleted,
    STORAGE_KEYS.canvasOrigin,
    STORAGE_KEYS.courseFilter,
    STORAGE_KEYS.customTasks,
  ]);

  state.completedIds = new Set(stored[STORAGE_KEYS.completedIds] || []);
  state.inProgressIds = new Set(
    (stored[STORAGE_KEYS.inProgressIds] || []).filter((id) => !state.completedIds.has(id))
  );
  state.reviewIds = new Set(
    (stored[STORAGE_KEYS.reviewIds] || []).filter(
      (id) => !state.completedIds.has(id) && !state.inProgressIds.has(id)
    )
  );
  state.hideCompleted = Boolean(stored[STORAGE_KEYS.hideCompleted]);
  state.courseFilter = stored[STORAGE_KEYS.courseFilter] || "all";
  state.customTasks = CustomTasks.hydrateCustomTasks(stored[STORAGE_KEYS.customTasks]);
  els.hideCompleted.checked = state.hideCompleted;

  const origin = stored[STORAGE_KEYS.canvasOrigin] || DEFAULT_ORIGIN;
  state.origin = origin;
  els.originInput.value = origin;
  setSchoolLabel(origin);
  populateCustomCourseSelect();
  await loadTasks(origin);
  startAutoSync();
}

function setSchoolLabel(origin) {
  try {
    els.schoolLabel.textContent = new URL(origin).host;
  } catch {
    els.schoolLabel.textContent = origin.replace(/^https?:\/\//, "");
  }
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

async function loadTasks(origin, { silent = false } = {}) {
  const generation = ++loadGeneration;
  if (!silent) {
    setBusy(true);
    showStatus("Syncing graded assignments…");
  }

  try {
    let tasks = [];
    let loadError = null;
    try {
      tasks = await fetchPlannerTasks(origin);
      if (!tasks.length) {
        tasks = await fetchTodoTasks(origin);
      }
    } catch (error) {
      loadError = error;
    }

    const courses = await fetchCourses(origin);
    if (generation !== loadGeneration) return;

    if (loadError) {
      if (silent && state.tasks.length) return;
      state.canvasTasks = [];
      if (courses.length) state.courses = courses;
      rebuildTaskList();
      populateCourseFilter();
      populateCustomCourseSelect();
      renderTasks();
      showStatus(loadError.message || "Could not load Canvas assignments.", "error");
      return;
    }

    state.origin = origin;
    state.courses = courses;
    state.canvasTasks = tasks;
    rebuildTaskList();
    setSchoolLabel(origin);
    await chrome.storage.local.set({ [STORAGE_KEYS.canvasOrigin]: origin });

    const synced = syncSubmittedCompletions(state.canvasTasks);
    if (synced > 0) {
      await persistTaskStatus();
      bumpProgress("done");
    }

    if (!silent) hideStatus();
    populateCourseFilter();
    populateCustomCourseSelect();
    renderTasks();
  } catch (error) {
    if (generation !== loadGeneration) return;
    if (silent && state.tasks.length) return;

    state.canvasTasks = [];
    rebuildTaskList();
    populateCourseFilter();
    populateCustomCourseSelect();
    renderTasks();
    showStatus(error.message || "Could not load Canvas assignments.", "error");
  } finally {
    if (!silent && generation === loadGeneration) setBusy(false);
  }
}

async function fetchPlannerTasks(origin) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const end = new Date();
  end.setMonth(end.getMonth() + 6);

  const params = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    per_page: "100",
  });

  const items = await fetchAllPages(`${origin}/api/v1/planner/items?${params}`);
  const assignmentIndex = await fetchAssignmentIndex(origin, items);
  return items
    .filter((item) => ASSIGNMENT_TYPES.has(String(item.plannable_type || "").toLowerCase()))
    .map((item) => mapPlannerItem(item, origin, assignmentIndex))
    .filter((task) => task && task.title);
}

async function fetchTodoTasks(origin) {
  const items = await fetchAllPages(`${origin}/api/v1/users/self/todo?per_page=100`);
  const assignmentIndex = await fetchAssignmentIndex(origin, items);
  return items
    .map((item) => mapTodoItem(item, origin, assignmentIndex))
    .filter((task) => task && task.title);
}

async function fetchCourses(origin) {
  try {
    const params = new URLSearchParams({ per_page: "100", enrollment_state: "active" });
    const items = await fetchAllPages(`${origin}/api/v1/courses?${params}`);
    return items
      .filter((course) => course && course.id && (course.name || course.course_code))
      .map((course) => ({
        id: String(course.id),
        name: String(course.name || course.course_code),
      }));
  } catch {
    return [];
  }
}

async function fetchAssignmentIndex(origin, items) {
  const courseIds = [
    ...new Set(
      items
        .map((item) => item.course_id || item.assignment?.course_id || item.plannable?.course_id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  const index = new Map();
  await Promise.all(
    courseIds.map(async (courseId) => {
      try {
        const assignmentParams = new URLSearchParams({ per_page: "100" });
        assignmentParams.append("include[]", "submission");

        const submissionParams = new URLSearchParams({ per_page: "100" });
        submissionParams.append("student_ids[]", "self");

        const [assignments, submissions] = await Promise.all([
          fetchAllPages(`${origin}/api/v1/courses/${courseId}/assignments?${assignmentParams}`),
          fetchAllPages(
            `${origin}/api/v1/courses/${courseId}/students/submissions?${submissionParams}`
          ).catch(() => []),
        ]);

        const submissionsByAssignment = new Map();
        for (const submission of submissions) {
          if (submission?.assignment_id != null) {
            submissionsByAssignment.set(String(submission.assignment_id), submission);
          }
        }

        for (const assignment of assignments) {
          const id = String(assignment.id);
          if (submissionsByAssignment.has(id)) {
            assignment.submission = submissionsByAssignment.get(id);
          }
          index.set(id, assignment);
        }
      } catch {
        // Keep planner data if a course assignment fetch fails.
      }
    })
  );
  return index;
}

function mapPlannerItem(item, origin, assignmentIndex) {
  const plannable = item.plannable || {};
  const assignment = resolveAssignment(item, assignmentIndex);
  if (!isGradebookAssignment(assignment, plannable)) return null;

  return {
    id: `${item.plannable_type || "item"}-${item.plannable_id || plannable.id || assignment.id}`,
    title: assignment?.name || plannable.title || plannable.name || "Untitled",
    course: item.context_name || assignment?.course_name || "Canvas",
    courseId: String(item.course_id || assignment?.course_id || ""),
    dueAt: item.plannable_date || assignment?.due_at || plannable.due_at || plannable.todo_date || null,
    url: toAbsoluteUrl(item.html_url || assignment?.html_url || plannable.html_url, origin),
    pointsPossible: firstNumber(assignment?.points_possible, plannable.points_possible, plannable.assignment?.points_possible),
    submitted: isSubmittedToGradebook(assignment?.submission, item.submissions, plannable.submission),
  };
}

function mapTodoItem(item, origin, assignmentIndex) {
  const raw = item.assignment || {};
  const assignment = assignmentIndex.get(String(raw.id)) || raw;
  if (!isGradebookAssignment(assignment, raw)) return null;

  return {
    id: `todo-${assignment.id || raw.id}`,
    title: assignment.name || raw.name || item.title || "Untitled",
    course: item.context_name || "Canvas",
    courseId: String(item.course_id || assignment.course_id || ""),
    dueAt: assignment.due_at || raw.due_at || item.due_at || null,
    url: toAbsoluteUrl(item.html_url || assignment.html_url || raw.html_url, origin),
    pointsPossible: firstNumber(assignment.points_possible, raw.points_possible),
    submitted: isSubmittedToGradebook(assignment.submission, raw.submission, item.submission, item.submissions),
  };
}

function resolveAssignment(item, assignmentIndex) {
  const plannable = item.plannable || {};
  const nested = plannable.assignment || item.assignment || {};
  const type = String(item.plannable_type || "").toLowerCase();
  const ids = [
    nested.id,
    plannable.assignment_id,
    type === "assignment" ? item.plannable_id : null,
    type === "assignment" ? plannable.id : null,
  ]
    .filter(Boolean)
    .map(String);

  for (const id of ids) {
    if (assignmentIndex.has(id)) return assignmentIndex.get(id);
  }
  return Object.keys(nested).length ? nested : plannable;
}

function isGradebookAssignment(assignment, fallback = {}) {
  const source = assignment && typeof assignment === "object" ? assignment : fallback;
  if (source.published === false) return false;

  const gradingType = String(source.grading_type || fallback.grading_type || "").toLowerCase();
  if (gradingType === "not_graded") return false;

  const quizType = String(source.quiz_type || fallback.quiz_type || "").toLowerCase();
  if (quizType === "practice_quiz" || quizType === "survey") {
    return false;
  }

  const points = firstNumber(source.points_possible, fallback.points_possible, fallback.assignment?.points_possible);
  if (["points", "percent", "letter_grade", "gpa_scale", "pass_fail"].includes(gradingType)) {
    return true;
  }
  return points != null;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isSubmittedToGradebook(...sources) {
  for (const source of sources) {
    const record = asRecord(source);
    if (!record) continue;
    if (record.excused || record.submitted || record.graded) return true;
    const workflow = String(record.workflow_state || "").toLowerCase();
    if (["submitted", "graded", "pending_review"].includes(workflow)) return true;
    if (record.submitted_at) return true;
    if (record.grade != null && record.grade !== "") return true;
    if (typeof record.score === "number" && Number.isFinite(record.score)) return true;
  }
  return false;
}

function syncSubmittedCompletions(tasks) {
  let added = 0;
  for (const task of tasks) {
    if (!task.submitted) continue;
    if (!state.completedIds.has(task.id)) {
      state.completedIds.add(task.id);
      added += 1;
    }
    state.inProgressIds.delete(task.id);
    state.reviewIds.delete(task.id);
  }
  return added;
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function toAbsoluteUrl(href, origin) {
  if (!href) return origin;
  try {
    return new URL(href, origin).href;
  } catch {
    return origin;
  }
}

async function fetchAllPages(startUrl) {
  const collected = [];
  let nextUrl = startUrl;
  let pages = 0;

  while (nextUrl && pages < 10) {
    pages += 1;
    const response = await fetch(nextUrl, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Not logged in. Open Canvas in this browser, sign in, then Refresh.");
    }
    if (!response.ok) {
      throw new Error(`Canvas returned ${response.status}. Check the URL and try again.`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Unexpected Canvas response. Confirm this is a Canvas URL.");
    }
    collected.push(...data);
    nextUrl = parseNextLink(response.headers.get("Link"));
  }

  return collected;
}

function parseNextLink(header) {
  if (!header) return "";
  const parts = header.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match) return match[1];
  }
  return "";
}

function sortTasks(tasks) {
  return CustomTasks.sortTasks(tasks);
}

function rebuildTaskList() {
  state.tasks = CustomTasks.mergeTasks(state.canvasTasks, state.customTasks);
}

function tasksForCourse() {
  if (state.courseFilter === "all") return state.tasks;
  return state.tasks.filter((task) => task.courseId === state.courseFilter);
}

function populateCourseFilter() {
  const courses = CustomTasks.collectCourses(state.courses, state.tasks);

  const selected = state.courseFilter;
  els.courseFilter.replaceChildren();

  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All classes";
  els.courseFilter.append(all);

  const names = [...courses.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  for (const [id, name] of names) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    els.courseFilter.append(option);
  }

  els.courseFilter.value = [...courses.keys(), "all"].includes(selected) ? selected : "all";
  state.courseFilter = els.courseFilter.value;
}

function populateCustomCourseSelect() {
  const courses = CustomTasks.collectCourses(state.courses, state.tasks);
  const selected = els.customCourse.value;
  els.customCourse.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a class";
  els.customCourse.append(placeholder);

  const names = [...courses.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  for (const [id, name] of names) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    els.customCourse.append(option);
  }

  if ([...courses.keys()].includes(selected)) {
    els.customCourse.value = selected;
  }
}

function taskStatus(task) {
  const id = typeof task === "object" && task ? task.id : task;
  const submitted = typeof task === "object" && Boolean(task?.submitted);
  if (submitted || state.completedIds.has(id)) return "done";
  if (state.reviewIds.has(id)) return "review";
  if (state.inProgressIds.has(id)) return "in-progress";
  return "todo";
}

function statusRank(task) {
  const status = taskStatus(task);
  if (status === "in-progress") return 0;
  if (status === "review") return 1;
  return 2;
}

function renderTasks() {
  const scoped = tasksForCourse();
  const visible = scoped.filter((task) => {
    if (!state.hideCompleted) return true;
    return taskStatus(task) !== "done";
  });

  updateProgress(scoped);

  els.taskList.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = scoped.length
      ? "All caught up in this class."
      : state.tasks.length
        ? "No assignments in this class."
        : "No graded assignments found. Add a custom assignment above.";
    els.taskList.append(empty);
    return;
  }

  const now = Date.now();
  const ordered = [...visible].sort((a, b) => statusRank(a) - statusRank(b));

  for (const task of ordered) {
    els.taskList.append(renderTask(task, now));
  }
}

function updateProgress(scoped) {
  const total = scoped.length;
  const done = scoped.filter((task) => taskStatus(task) === "done").length;
  const review = scoped.filter((task) => taskStatus(task) === "review").length;
  const active = scoped.filter((task) => taskStatus(task) === "in-progress").length;
  const left = total - done - review - active;
  const donePercent = total ? (done / total) * 100 : 0;
  const reviewPercent = total ? (review / total) * 100 : 0;
  const activePercent = total ? (active / total) * 100 : 0;

  els.progressCard.hidden = !total;
  els.progressCard.setAttribute(
    "aria-label",
    `${done} done, ${review} review, ${active} in progress, ${left} left`
  );
  els.progressDone.textContent = String(done);
  els.progressReview.textContent = String(review);
  els.progressActive.textContent = String(active);
  els.progressLeft.textContent =
    left === 0 && total && !active && !review ? "cleared" : `${left} left`;
  els.progressFillDone.style.width = `${donePercent}%`;
  els.progressFillReview.style.width = `${reviewPercent}%`;
  els.progressFillActive.style.width = `${activePercent}%`;
}

function renderTask(task, now) {
  const li = document.createElement("li");
  const status = taskStatus(task);
  const done = status === "done";
  const active = status === "in-progress";
  const review = status === "review";
  const submitted = Boolean(task.submitted);
  li.className = active ? "task in-progress" : review ? "task review" : done ? "task done" : "task";
  if (CustomTasks.isCustomTask(task)) li.classList.add("custom-task");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = done;
  checkbox.disabled = submitted;
  checkbox.setAttribute("aria-label", `Mark ${task.title} complete`);
  if (submitted) checkbox.title = "Submitted in Canvas";
  checkbox.addEventListener("change", () => toggleComplete(task.id, checkbox.checked, li));

  const progressBtn = document.createElement("button");
  progressBtn.type = "button";
  progressBtn.className = "progress-toggle";
  progressBtn.disabled = submitted;
  progressBtn.setAttribute("aria-pressed", String(active));
  progressBtn.setAttribute(
    "aria-label",
    active ? `Remove ${task.title} from in progress` : `Mark ${task.title} in progress`
  );
  progressBtn.title = submitted ? "Submitted in Canvas" : active ? "In progress" : "Mark in progress";
  progressBtn.addEventListener("click", () => toggleInProgress(task.id, !active));

  const reviewBtn = document.createElement("button");
  reviewBtn.type = "button";
  reviewBtn.className = "review-toggle";
  reviewBtn.disabled = submitted;
  reviewBtn.setAttribute("aria-pressed", String(review));
  reviewBtn.setAttribute(
    "aria-label",
    review ? `Remove ${task.title} from needs review` : `Mark ${task.title} as needs review`
  );
  reviewBtn.title = submitted
    ? "Submitted in Canvas"
    : review
      ? "Needs review"
      : "Mark as needs review";
  reviewBtn.addEventListener("click", () => toggleReview(task.id, !review));

  const statusGroup = document.createElement("div");
  statusGroup.className = "task-status";
  statusGroup.append(checkbox, progressBtn, reviewBtn);

  const body = document.createElement("div");

  const title = document.createElement("a");
  title.className = "task-title";
  title.textContent = task.title;
  title.href = task.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: task.url });
  });

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const course = document.createElement("span");
  course.className = "course-tag";
  course.textContent = task.course;
  course.title = task.course;

  const points = document.createElement("span");
  points.className = CustomTasks.isCustomTask(task) ? "custom-tag" : "points-tag";
  points.textContent = formatPoints(task.pointsPossible, CustomTasks.isCustomTask(task));

  const due = document.createElement("span");
  due.className = "due";
  const dueText = formatDue(task.dueAt, now);
  due.textContent = dueText.label;
  if (dueText.overdue) due.classList.add("overdue");
  if (dueText.undated) due.classList.add("undated");

  meta.append(course, points);
  if (active) {
    const statusTag = document.createElement("span");
    statusTag.className = "status-tag";
    statusTag.textContent = "In progress";
    meta.append(statusTag);
  } else if (review) {
    const statusTag = document.createElement("span");
    statusTag.className = "review-tag";
    statusTag.textContent = "Needs review";
    meta.append(statusTag);
  } else if (submitted) {
    const statusTag = document.createElement("span");
    statusTag.className = "submitted-tag";
    statusTag.textContent = "Submitted";
    meta.append(statusTag);
  }
  meta.append(due);
  body.append(title, meta);
  li.append(statusGroup, body);

  if (CustomTasks.isCustomTask(task)) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "custom-remove";
    removeBtn.setAttribute("aria-label", `Remove ${task.title}`);
    removeBtn.title = "Remove custom assignment";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => deleteCustomAssignment(task.id));
    li.append(removeBtn);
  }

  return li;
}

function formatPoints(points, custom = false) {
  if (custom) return "Custom";
  if (points == null) return "Graded";
  const value = Number.isInteger(points) ? String(points) : String(Number(points.toFixed(2)));
  return `${value} pt${points === 1 ? "" : "s"}`;
}

function formatDue(dueAt, now) {
  if (!dueAt) return { label: "No due date", undated: true, overdue: false };
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return { label: "No due date", undated: true, overdue: false };

  const label = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return { label, overdue: date.getTime() < now, undated: false };
}

async function persistTaskStatus() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.completedIds]: [...state.completedIds],
    [STORAGE_KEYS.inProgressIds]: [...state.inProgressIds],
    [STORAGE_KEYS.reviewIds]: [...state.reviewIds],
  });
}

async function persistCustomTasks() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.customTasks]: state.customTasks,
  });
}

function showCustomError(message) {
  els.customError.hidden = false;
  els.customError.textContent = message;
}

function hideCustomError() {
  els.customError.hidden = true;
  els.customError.textContent = "";
}

async function addCustomAssignment() {
  hideCustomError();
  const validated = CustomTasks.validateCustomAssignment({
    title: els.customTitle.value,
    url: els.customUrl.value,
    courseId: els.customCourse.value,
    dueAt: els.customDue.value,
  });
  if (!validated.ok) {
    showCustomError(validated.errors[0]);
    return;
  }

  const courses = CustomTasks.collectCourses(state.courses, state.tasks);
  const task = CustomTasks.createCustomTask({
    title: validated.value.title,
    url: validated.value.url,
    courseId: validated.value.courseId,
    course: courses.get(validated.value.courseId) || CustomTasks.OTHER_COURSE_NAME,
    dueAt: validated.value.dueAt,
  });

  state.customTasks = [...state.customTasks, task];
  await persistCustomTasks();
  rebuildTaskList();

  if (state.courseFilter !== "all" && state.courseFilter !== task.courseId) {
    state.courseFilter = "all";
    await chrome.storage.local.set({ [STORAGE_KEYS.courseFilter]: "all" });
  }

  els.customForm.reset();
  populateCourseFilter();
  populateCustomCourseSelect();
  if (els.customDetails) els.customDetails.open = false;
  renderTasks();
}

async function deleteCustomAssignment(taskId) {
  state.customTasks = CustomTasks.removeCustomTask(state.customTasks, taskId);
  state.completedIds.delete(taskId);
  state.inProgressIds.delete(taskId);
  state.reviewIds.delete(taskId);
  await persistCustomTasks();
  await persistTaskStatus();
  rebuildTaskList();
  populateCourseFilter();
  populateCustomCourseSelect();
  renderTasks();
}

function bumpProgress(kind) {
  els.progressCard.classList.remove("bump", "bump-active", "bump-review");
  void els.progressCard.offsetWidth;
  const className =
    kind === "active" ? "bump-active" : kind === "review" ? "bump-review" : "bump";
  els.progressCard.classList.add(className);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function confettiColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return [
    read("--ok", "#7dcea0"),
    read("--accent", "#7aa2ff"),
    read("--points-text", "#f0c987"),
    read("--in-progress", "#6ec8ff"),
    read("--review", "#c9a8ff"),
    read("--tag-text", "#c5d4ff"),
    read("--danger", "#ff8b8b"),
  ];
}

function sizeConfettiCanvas() {
  const canvas = els.confettiCanvas;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function burstConfetti(originEl) {
  if (prefersReducedMotion() || !els.confettiCanvas) return;

  const ctx = sizeConfettiCanvas();
  const rect = originEl?.getBoundingClientRect();
  const originX = rect ? rect.left + 9 : window.innerWidth / 2;
  const originY = rect ? rect.top + 12 : 72;
  const colors = confettiColors();
  const count = 72;

  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 3.6 + Math.random() * 7.4;
    confettiPieces.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.4,
      w: 4 + Math.random() * 5,
      h: 6 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.38,
      color: colors[i % colors.length],
      shape: Math.random() < 0.2 ? "circle" : "rect",
      life: 1,
      decay: 0.007 + Math.random() * 0.01,
      gravity: 0.13 + Math.random() * 0.08,
    });
  }

  if (!confettiFrame) tickConfetti(ctx);
}

function tickConfetti(ctx) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);

  confettiPieces = confettiPieces.filter((piece) => {
    piece.vy += piece.gravity;
    piece.vx *= 0.986;
    piece.vy *= 0.995;
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.rot += piece.vr;
    piece.life -= piece.decay;
    if (piece.life <= 0 || piece.y > height + 24) return false;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, piece.life * 1.25));
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rot);
    ctx.fillStyle = piece.color;
    if (piece.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, piece.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    }
    ctx.restore();
    return true;
  });

  if (confettiPieces.length) {
    confettiFrame = window.requestAnimationFrame(() => tickConfetti(ctx));
    return;
  }

  ctx.clearRect(0, 0, width, height);
  confettiFrame = 0;
}

async function toggleComplete(taskId, completed, row) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (task?.submitted && !completed) {
    renderTasks();
    return;
  }

  if (completed) {
    state.completedIds.add(taskId);
    state.inProgressIds.delete(taskId);
    state.reviewIds.delete(taskId);
    burstConfetti(row);
  } else {
    state.completedIds.delete(taskId);
  }

  await persistTaskStatus();
  bumpProgress("done");

  if (completed && state.hideCompleted && row) {
    row.classList.add("closing");
    window.setTimeout(() => renderTasks(), 180);
    return;
  }

  renderTasks();
}

async function toggleInProgress(taskId, active) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (task?.submitted) return;

  if (active) {
    state.inProgressIds.add(taskId);
    state.completedIds.delete(taskId);
    state.reviewIds.delete(taskId);
  } else {
    state.inProgressIds.delete(taskId);
  }

  await persistTaskStatus();
  bumpProgress("active");
  renderTasks();
}

async function toggleReview(taskId, reviewing) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (task?.submitted) return;

  if (reviewing) {
    state.reviewIds.add(taskId);
    state.completedIds.delete(taskId);
    state.inProgressIds.delete(taskId);
  } else {
    state.reviewIds.delete(taskId);
  }

  await persistTaskStatus();
  bumpProgress("review");
  renderTasks();
}

function showStatus(message, kind = "") {
  els.status.hidden = false;
  els.status.textContent = message;
  els.status.className = kind === "error" ? "status error" : "status";
}

function hideStatus() {
  els.status.hidden = true;
  els.status.textContent = "";
}

function setBusy(busy) {
  els.refreshBtn.disabled = busy;
  els.originForm.querySelector("button").disabled = busy;
  els.courseFilter.disabled = busy;
}

function currentOrigin() {
  return normalizeOrigin(els.originInput.value) || state.origin || DEFAULT_ORIGIN;
}

function scheduleRefresh({ silent = true, delay = 400 } = {}) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    loadTasks(currentOrigin(), { silent });
  }, delay);
}

function startAutoSync() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "canvas-submitted") return;
    scheduleRefresh({ silent: true, delay: 1600 });
  });

  window.addEventListener("focus", () => {
    scheduleRefresh({ silent: true, delay: 250 });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRefresh({ silent: true, delay: 250 });
  });

  window.setInterval(() => {
    if (document.hidden) return;
    scheduleRefresh({ silent: true, delay: 0 });
  }, 60000);
}
