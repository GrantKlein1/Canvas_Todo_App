(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.GradebookTasks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
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

  function assignmentGroupsUrl(origin, courseId) {
    const params = new URLSearchParams({ per_page: "100" });
    params.append("include[]", "assignments");
    params.append("include[]", "submission");
    return `${origin}/api/v1/courses/${courseId}/assignment_groups?${params}`;
  }

  function courseAssignmentsUrl(origin, courseId) {
    const params = new URLSearchParams({ per_page: "100" });
    params.append("include[]", "submission");
    return `${origin}/api/v1/courses/${courseId}/assignments?${params}`;
  }

  function courseSubmissionsUrl(origin, courseId) {
    const params = new URLSearchParams({ per_page: "100" });
    params.append("student_ids[]", "self");
    return `${origin}/api/v1/courses/${courseId}/students/submissions?${params}`;
  }

  function flattenAssignmentGroups(groups) {
    const assignments = [];
    for (const group of Array.isArray(groups) ? groups : []) {
      const nested = Array.isArray(group?.assignments) ? group.assignments : [];
      for (const assignment of nested) {
        assignments.push(assignment);
      }
    }
    return assignments;
  }

  function pickGradebookAssignments(groups, fallbackAssignments) {
    const fromGroups = flattenAssignmentGroups(groups);
    return fromGroups.length ? fromGroups : Array.isArray(fallbackAssignments) ? fallbackAssignments : [];
  }

  function mergeSubmissions(assignments, submissions) {
    const submissionsByAssignment = new Map();
    for (const submission of Array.isArray(submissions) ? submissions : []) {
      if (submission?.assignment_id != null) {
        submissionsByAssignment.set(String(submission.assignment_id), submission);
      }
    }

    return (Array.isArray(assignments) ? assignments : []).map((assignment) => {
      const id = String(assignment?.id ?? "");
      if (!id || !submissionsByAssignment.has(id)) return assignment;
      return { ...assignment, submission: submissionsByAssignment.get(id) };
    });
  }

  function isGradebookAssignment(assignment, fallback = {}) {
    const source = assignment && typeof assignment === "object" ? assignment : fallback;

    const gradingType = String(source.grading_type || fallback.grading_type || "").toLowerCase();
    if (gradingType === "not_graded") return false;

    const quizType = String(source.quiz_type || fallback.quiz_type || "").toLowerCase();
    if (quizType === "practice_quiz" || quizType === "survey") {
      return false;
    }

    const points = firstNumber(
      source.points_possible,
      fallback.points_possible,
      fallback.assignment?.points_possible
    );
    if (["points", "percent", "letter_grade", "gpa_scale", "pass_fail"].includes(gradingType)) {
      return true;
    }
    return points != null;
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

  function assignmentUrl(assignment, course, origin) {
    const source = asRecord(assignment) || {};
    if (source.html_url || source.url) {
      return toAbsoluteUrl(source.html_url || source.url, origin);
    }
    const courseId = course?.id || source.course_id;
    if (courseId != null && source.id != null) {
      return toAbsoluteUrl(`/courses/${courseId}/assignments/${source.id}`, origin);
    }
    return origin;
  }

  function mapGradebookAssignment(assignment, course, origin) {
    if (!isGradebookAssignment(assignment)) return null;
    const id = assignment?.id;
    if (id == null || id === "") return null;

    const courseId = String(course?.id || assignment.course_id || "");
    const courseName = String(course?.name || assignment.course_name || "Canvas");

    return {
      id: `assignment-${id}`,
      title: assignment.name || assignment.title || "Untitled",
      course: courseName,
      courseId,
      dueAt: assignment.due_at || null,
      url: assignmentUrl(assignment, course, origin),
      pointsPossible: firstNumber(assignment.points_possible),
      submitted: isSubmittedToGradebook(assignment.submission),
    };
  }

  function collectGradebookTasks(assignments, course, origin) {
    const seen = new Set();
    const tasks = [];
    for (const assignment of Array.isArray(assignments) ? assignments : []) {
      const task = mapGradebookAssignment(assignment, course, origin);
      if (!task || seen.has(task.id)) continue;
      seen.add(task.id);
      tasks.push(task);
    }
    return tasks;
  }

  return {
    assignmentGroupsUrl,
    courseAssignmentsUrl,
    courseSubmissionsUrl,
    flattenAssignmentGroups,
    pickGradebookAssignments,
    mergeSubmissions,
    isGradebookAssignment,
    isSubmittedToGradebook,
    mapGradebookAssignment,
    collectGradebookTasks,
    firstNumber,
    toAbsoluteUrl,
  };
});
