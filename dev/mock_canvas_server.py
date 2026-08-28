#!/usr/bin/env python3
"""Minimal mock Canvas API server for local development/testing of the
Canvas To-Do Chrome extension. Serves just the endpoints the extension calls:

  GET /api/v1/planner/items
  GET /api/v1/users/self/todo
  GET /api/v1/courses/<id>/assignments
  GET /api/v1/courses/<id>/students/submissions

It returns realistic, dynamically-dated data across a few courses, including
one already-submitted assignment so the "submitted checks itself off" flow can
be demonstrated.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

PORT = 8777


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


NOW = datetime.now(timezone.utc)

# course_id -> (course name, [assignments])
# Each assignment: id, name, points_possible, grading_type, due offset (days),
# and whether it has been submitted in Canvas.
COURSES = {
    1: {
        "name": "Biology 101",
        "assignments": [
            {"id": 101, "name": "Cell Structure Lab Report", "points": 50, "due_days": 2, "submitted": False},
            {"id": 102, "name": "Photosynthesis Quiz", "points": 20, "due_days": 5, "submitted": False, "type": "quiz"},
            {"id": 103, "name": "Reading Response: Ch. 3", "points": 10, "due_days": -1, "submitted": False, "type": "discussion_topic"},
        ],
    },
    2: {
        "name": "Calculus II",
        "assignments": [
            {"id": 201, "name": "Problem Set 4 — Integrals", "points": 40, "due_days": 1, "submitted": False},
            {"id": 202, "name": "Midterm Exam", "points": 100, "due_days": 9, "submitted": False, "type": "quiz"},
        ],
    },
    3: {
        "name": "English Literature",
        "assignments": [
            {"id": 301, "name": "Essay: The Great Gatsby", "points": 60, "due_days": -3, "submitted": True},
            {"id": 302, "name": "Peer Review Discussion", "points": 15, "due_days": 4, "submitted": False, "type": "discussion_topic"},
        ],
    },
}


def assignment_type(a):
    return a.get("type", "assignment")


def submission_for(a):
    if a["submitted"]:
        return {
            "id": a["id"] * 10,
            "assignment_id": a["id"],
            "workflow_state": "submitted",
            "submitted_at": iso(NOW - timedelta(days=4)),
            "submitted": True,
            "score": None,
            "grade": None,
        }
    return {
        "id": a["id"] * 10,
        "assignment_id": a["id"],
        "workflow_state": "unsubmitted",
        "submitted_at": None,
    }


def build_assignment(course_id, a):
    return {
        "id": a["id"],
        "name": a["name"],
        "course_id": course_id,
        "course_name": COURSES[course_id]["name"],
        "points_possible": a["points"],
        "grading_type": "points",
        "published": True,
        "due_at": iso(NOW + timedelta(days=a["due_days"])),
        "html_url": f"/courses/{course_id}/assignments/{a['id']}",
    }


def build_planner_item(course_id, a):
    a_type = assignment_type(a)
    return {
        "plannable_type": a_type,
        "plannable_id": a["id"],
        "course_id": course_id,
        "context_name": COURSES[course_id]["name"],
        "plannable_date": iso(NOW + timedelta(days=a["due_days"])),
        "html_url": f"/courses/{course_id}/assignments/{a['id']}",
        "submissions": submission_for(a) if a_type == "assignment" else False,
        "plannable": {
            "id": a["id"],
            "title": a["name"],
            "points_possible": a["points"],
            "due_at": iso(NOW + timedelta(days=a["due_days"])),
        },
    }


def planner_items():
    items = []
    for cid, course in COURSES.items():
        for a in course["assignments"]:
            items.append(build_planner_item(cid, a))
    return items


def course_assignments(course_id):
    course = COURSES.get(course_id)
    if not course:
        return []
    out = []
    for a in course["assignments"]:
        assignment = build_assignment(course_id, a)
        assignment["submission"] = submission_for(a)
        out.append(assignment)
    return out


def course_submissions(course_id):
    course = COURSES.get(course_id)
    if not course:
        return []
    return [submission_for(a) for a in course["assignments"]]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[mock-canvas]", self.command, self.path, "->", fmt % args)

    def _send(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send({}, 200)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/v1/planner/items":
            return self._send(planner_items())

        if path == "/api/v1/users/self/todo":
            return self._send([])

        m = re.match(r"^/api/v1/courses/(\d+)/assignments$", path)
        if m:
            return self._send(course_assignments(int(m.group(1))))

        m = re.match(r"^/api/v1/courses/(\d+)/students/submissions$", path)
        if m:
            return self._send(course_submissions(int(m.group(1))))

        # A simple landing page so the origin resolves to something in a browser.
        if path == "/" or path == "":
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Mock Canvas</h1><p>Signed in (mock).</p>")
            return

        self._send({"errors": [{"message": "not found"}]}, 404)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Mock Canvas API listening on http://127.0.0.1:{PORT}")
    server.serve_forever()
