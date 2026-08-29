const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assignmentGroupsUrl,
  courseAssignmentsUrl,
  courseSubmissionsUrl,
  flattenAssignmentGroups,
  mergeSubmissions,
  isGradebookAssignment,
  isSubmittedToGradebook,
  mapGradebookAssignment,
  collectGradebookTasks,
} = require("../gradebook-tasks.js");

const ORIGIN = "https://school.instructure.com";
const COURSE = { id: "42", name: "Strange Module Class" };

describe("gradebook URLs", () => {
  it("asks assignment groups for nested assignments and the student submission", () => {
    const url = new URL(assignmentGroupsUrl(ORIGIN, 42));
    assert.equal(url.pathname, "/api/v1/courses/42/assignment_groups");
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.deepEqual(url.searchParams.getAll("include[]"), ["assignments", "submission"]);
  });

  it("falls back to the course assignments index with submissions", () => {
    const assignments = new URL(courseAssignmentsUrl(ORIGIN, 42));
    const submissions = new URL(courseSubmissionsUrl(ORIGIN, 42));
    assert.equal(assignments.pathname, "/api/v1/courses/42/assignments");
    assert.deepEqual(assignments.searchParams.getAll("include[]"), ["submission"]);
    assert.equal(submissions.pathname, "/api/v1/courses/42/students/submissions");
    assert.deepEqual(submissions.searchParams.getAll("student_ids[]"), ["self"]);
  });
});

describe("flattenAssignmentGroups", () => {
  it("collects gradebook assignments even when they are not in a module", () => {
    const groups = [
      {
        id: 1,
        name: "Homework",
        assignments: [
          {
            id: 101,
            name: "Week 1 reading",
            html_url: `${ORIGIN}/courses/42/assignments/101`,
            points_possible: 10,
            grading_type: "points",
            published: true,
          },
        ],
      },
      {
        id: 2,
        name: "Future module work",
        assignments: [
          {
            id: 202,
            name: "Hidden-module lab",
            html_url: `${ORIGIN}/courses/42/assignments/202`,
            points_possible: 25,
            grading_type: "points",
            published: false,
          },
        ],
      },
    ];

    const assignments = flattenAssignmentGroups(groups);
    assert.equal(assignments.length, 2);
    assert.deepEqual(
      assignments.map((item) => item.name),
      ["Week 1 reading", "Hidden-module lab"]
    );
  });

  it("treats missing nested assignment lists as empty", () => {
    assert.deepEqual(flattenAssignmentGroups([{ id: 1, name: "Empty" }]), []);
    assert.deepEqual(flattenAssignmentGroups(null), []);
  });
});

describe("pickGradebookAssignments", () => {
  it("prefers nested gradebook assignments and falls back to the course assignment index", () => {
    const { pickGradebookAssignments } = require("../gradebook-tasks.js");
    const groups = [
      {
        assignments: [{ id: 1, name: "From gradebook" }],
      },
    ];
    const fallback = [{ id: 2, name: "From assignments index" }];
    assert.equal(pickGradebookAssignments(groups, fallback)[0].name, "From gradebook");
    assert.equal(pickGradebookAssignments([], fallback)[0].name, "From assignments index");
    assert.deepEqual(pickGradebookAssignments([{ name: "Empty" }], fallback)[0].name, "From assignments index");
  });
});

describe("isGradebookAssignment", () => {
  it("keeps graded work that appears in the gradebook, including unpublished items", () => {
    assert.equal(
      isGradebookAssignment({
        name: "Future lab",
        points_possible: 20,
        grading_type: "points",
        published: false,
      }),
      true
    );
  });

  it("drops practice quizzes, surveys, and not-graded items", () => {
    assert.equal(
      isGradebookAssignment({ quiz_type: "practice_quiz", points_possible: 5 }),
      false
    );
    assert.equal(isGradebookAssignment({ quiz_type: "survey", points_possible: 5 }), false);
    assert.equal(
      isGradebookAssignment({ grading_type: "not_graded", points_possible: 5 }),
      false
    );
  });
});

describe("mapGradebookAssignment", () => {
  it("uses the gradebook assignment link, including a constructed future location", () => {
    const withLink = mapGradebookAssignment(
      {
        id: 202,
        name: "Hidden-module lab",
        html_url: `${ORIGIN}/courses/42/assignments/202`,
        due_at: "2026-09-12T04:59:00Z",
        points_possible: 25,
        grading_type: "points",
        published: false,
      },
      COURSE,
      ORIGIN
    );
    assert.equal(withLink.id, "assignment-202");
    assert.equal(withLink.title, "Hidden-module lab");
    assert.equal(withLink.course, "Strange Module Class");
    assert.equal(withLink.courseId, "42");
    assert.equal(withLink.url, `${ORIGIN}/courses/42/assignments/202`);
    assert.equal(withLink.dueAt, "2026-09-12T04:59:00Z");
    assert.equal(withLink.pointsPossible, 25);
    assert.equal(withLink.submitted, false);

    const withoutLink = mapGradebookAssignment(
      {
        id: 303,
        name: "Soon-to-exist quiz",
        points_possible: 15,
        grading_type: "points",
      },
      COURSE,
      ORIGIN
    );
    assert.equal(withoutLink.url, `${ORIGIN}/courses/42/assignments/303`);
  });

  it("marks submitted gradebook rows complete", () => {
    const task = mapGradebookAssignment(
      {
        id: 9,
        name: "Already turned in",
        points_possible: 10,
        grading_type: "points",
        html_url: `${ORIGIN}/courses/42/assignments/9`,
        submission: { workflow_state: "submitted", submitted_at: "2026-08-20T12:00:00Z" },
      },
      COURSE,
      ORIGIN
    );
    assert.equal(task.submitted, true);
  });
});

describe("collectGradebookTasks", () => {
  it("builds the todo list from gradebook rows, skipping ungraded work and duplicates", () => {
    const tasks = collectGradebookTasks(
      [
        {
          id: 202,
          name: "Hidden-module lab",
          html_url: `${ORIGIN}/courses/42/assignments/202`,
          points_possible: 25,
          grading_type: "points",
          published: false,
        },
        {
          id: 202,
          name: "Hidden-module lab duplicate",
          points_possible: 25,
          grading_type: "points",
        },
        {
          id: 8,
          name: "Practice",
          quiz_type: "practice_quiz",
          points_possible: 1,
        },
      ],
      COURSE,
      ORIGIN
    );

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, "Hidden-module lab");
    assert.equal(tasks[0].url, `${ORIGIN}/courses/42/assignments/202`);
  });
});

describe("mergeSubmissions", () => {
  it("attaches the matching student submission onto each assignment", () => {
    const merged = mergeSubmissions(
      [{ id: 1, name: "Lab" }, { id: 2, name: "Quiz" }],
      [{ assignment_id: 2, workflow_state: "graded", score: 9 }]
    );
    assert.equal(merged[0].submission, undefined);
    assert.equal(merged[1].submission.workflow_state, "graded");
  });
});

describe("isSubmittedToGradebook", () => {
  it("treats excused, graded, and submitted workflows as done", () => {
    assert.equal(isSubmittedToGradebook({ excused: true }), true);
    assert.equal(isSubmittedToGradebook({ workflow_state: "graded" }), true);
    assert.equal(isSubmittedToGradebook({ submitted_at: "2026-08-01T00:00:00Z" }), true);
    assert.equal(isSubmittedToGradebook({ workflow_state: "unsubmitted" }), false);
  });
});

describe("gradebook to-do pipeline", () => {
  it("turns gradebook groups into todo items even when the module is unpublished", () => {
    const groups = [
      {
        id: 7,
        name: "Assignments",
        assignments: [
          {
            id: 8801,
            name: "Module 3 lab (not in published modules)",
            html_url: `${ORIGIN}/courses/42/assignments/8801`,
            due_at: "2026-09-18T04:59:00Z",
            points_possible: 40,
            grading_type: "points",
            published: false,
            submission: { workflow_state: "unsubmitted" },
          },
          {
            id: 8802,
            name: "Practice knowledge check",
            quiz_type: "practice_quiz",
            points_possible: 0,
          },
        ],
      },
    ];

    const assignments = mergeSubmissions(flattenAssignmentGroups(groups), [
      { assignment_id: 8801, workflow_state: "unsubmitted" },
    ]);
    const tasks = collectGradebookTasks(assignments, COURSE, ORIGIN);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, "assignment-8801");
    assert.equal(tasks[0].title, "Module 3 lab (not in published modules)");
    assert.equal(tasks[0].url, `${ORIGIN}/courses/42/assignments/8801`);
    assert.equal(tasks[0].dueAt, "2026-09-18T04:59:00Z");
    assert.equal(tasks[0].submitted, false);
  });
});
