const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  OTHER_COURSE_ID,
  OTHER_COURSE_NAME,
  isCustomTask,
  normalizeAssignmentUrl,
  datetimeLocalToIso,
  createCustomTask,
  validateCustomAssignment,
  mergeTasks,
  removeCustomTask,
  collectCourses,
} = require("../custom-tasks.js");

describe("normalizeAssignmentUrl", () => {
  it("accepts https URLs", () => {
    assert.equal(
      normalizeAssignmentUrl("https://example.com/work"),
      "https://example.com/work"
    );
  });

  it("adds https when the protocol is missing", () => {
    assert.equal(
      normalizeAssignmentUrl("canvas.example.edu/courses/1/assignments/2"),
      "https://canvas.example.edu/courses/1/assignments/2"
    );
  });

  it("rejects blank and non-http values", () => {
    assert.equal(normalizeAssignmentUrl(""), "");
    assert.equal(normalizeAssignmentUrl("   "), "");
    assert.equal(normalizeAssignmentUrl("javascript:alert(1)"), "");
  });
});

describe("datetimeLocalToIso", () => {
  it("returns null for an empty value", () => {
    assert.equal(datetimeLocalToIso(""), null);
    assert.equal(datetimeLocalToIso("  "), null);
  });

  it("converts a datetime-local value to ISO", () => {
    const iso = datetimeLocalToIso("2026-09-15T23:59");
    assert.equal(typeof iso, "string");
    assert.equal(new Date(iso).getFullYear(), 2026);
    assert.equal(new Date(iso).getMonth(), 8);
    assert.equal(new Date(iso).getDate(), 15);
  });
});

describe("validateCustomAssignment", () => {
  it("requires title, link, and class", () => {
    const result = validateCustomAssignment({
      title: " ",
      url: "",
      courseId: "",
      dueAt: "",
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["Enter a title.", "Enter a valid link.", "Select a class."]);
  });

  it("accepts a complete assignment with a due date", () => {
    const result = validateCustomAssignment({
      title: "Lab write-up",
      url: "https://docs.google.com/doc/abc",
      courseId: "12",
      dueAt: "2026-09-15T23:59",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.title, "Lab write-up");
    assert.equal(result.value.url, "https://docs.google.com/doc/abc");
    assert.equal(result.value.courseId, "12");
    assert.ok(result.value.dueAt);
  });

  it("rejects an invalid due date", () => {
    const result = validateCustomAssignment({
      title: "Lab write-up",
      url: "https://example.com",
      courseId: "12",
      dueAt: "not-a-date",
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.includes("Enter a valid due date."), true);
  });

  it("allows a missing due date", () => {
    const result = validateCustomAssignment({
      title: "Read chapter 4",
      url: "https://example.com/reading",
      courseId: "3",
      dueAt: "",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.dueAt, null);
  });
});

describe("createCustomTask", () => {
  it("builds a custom task with the submitted fields", () => {
    const task = createCustomTask({
      title: "Office hours",
      url: "https://example.com/meet",
      courseId: "2",
      course: "Calculus II",
      dueAt: "2026-09-01T12:00:00.000Z",
    });
    assert.equal(task.custom, true);
    assert.match(task.id, /^custom-/);
    assert.equal(task.title, "Office hours");
    assert.equal(task.course, "Calculus II");
    assert.equal(task.courseId, "2");
    assert.equal(task.url, "https://example.com/meet");
    assert.equal(task.dueAt, "2026-09-01T12:00:00.000Z");
    assert.equal(task.submitted, false);
    assert.equal(task.pointsPossible, null);
  });
});

describe("mergeTasks", () => {
  it("keeps custom assignments when Canvas tasks refresh", () => {
    const canvas = [
      {
        id: "assignment-101",
        title: "Cell Structure Lab Report",
        dueAt: "2026-09-10T00:00:00.000Z",
      },
    ];
    const custom = [
      createCustomTask({
        title: "Study group",
        url: "https://example.com/study",
        courseId: "1",
        course: "Biology 101",
        dueAt: "2026-09-02T00:00:00.000Z",
      }),
    ];
    const merged = mergeTasks(canvas, custom);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].title, "Study group");
    assert.equal(merged[1].title, "Cell Structure Lab Report");
  });

  it("still shows custom assignments when Canvas returns nothing", () => {
    const custom = [
      createCustomTask({
        title: "Library visit",
        url: "https://example.com/library",
        courseId: OTHER_COURSE_ID,
        course: OTHER_COURSE_NAME,
        dueAt: null,
      }),
    ];
    const merged = mergeTasks([], custom);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, "Library visit");
  });
});

describe("removeCustomTask", () => {
  it("removes only the matching custom assignment", () => {
    const first = createCustomTask({
      title: "One",
      url: "https://example.com/1",
      courseId: "1",
      course: "Biology 101",
    });
    const second = createCustomTask({
      title: "Two",
      url: "https://example.com/2",
      courseId: "1",
      course: "Biology 101",
    });
    const remaining = removeCustomTask([first, second], first.id);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, second.id);
  });
});

describe("collectCourses", () => {
  it("prefers Canvas classes and includes custom-only classes", () => {
    const courses = collectCourses(
      [{ id: 1, name: "Biology 101" }],
      [
        {
          courseId: "2",
          course: "Club meeting",
          custom: true,
        },
      ]
    );
    assert.equal(courses.get("1"), "Biology 101");
    assert.equal(courses.get("2"), "Club meeting");
    assert.equal(courses.has(OTHER_COURSE_ID), false);
  });

  it("falls back to Other when no classes exist", () => {
    const courses = collectCourses([], []);
    assert.equal(courses.get(OTHER_COURSE_ID), OTHER_COURSE_NAME);
  });
});

describe("hydrateCustomTasks", () => {
  it("keeps valid stored custom assignments and drops junk", () => {
    const { hydrateCustomTasks } = require("../custom-tasks.js");
    const stored = [
      {
        id: "custom-1",
        title: "Office hours",
        course: "Biology 101",
        courseId: "1",
        dueAt: "2026-09-01T12:00:00.000Z",
        url: "example.com/meet",
        custom: true,
      },
      { id: "assignment-9", title: "Not custom" },
      { id: "custom-2", title: "  ", url: "https://example.com", custom: true },
      { id: "custom-3", title: "Broken link", url: "javascript:alert(1)", custom: true },
    ];
    const tasks = hydrateCustomTasks(stored);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, "custom-1");
    assert.equal(tasks[0].url, "https://example.com/meet");
    assert.equal(tasks[0].custom, true);
    assert.equal(tasks[0].submitted, false);
  });
});

describe("isCustomTask", () => {
  it("detects custom tasks by flag or id prefix", () => {
    assert.equal(isCustomTask({ id: "assignment-1", custom: false }), false);
    assert.equal(isCustomTask({ id: "custom-abc", custom: true }), true);
    assert.equal(isCustomTask({ id: "custom-abc" }), true);
  });
});
