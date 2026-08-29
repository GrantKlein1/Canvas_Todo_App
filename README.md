# Canvas To-Do

A simple to-do list for your Canvas assignments. It lives in your browser and pulls in the graded work from your school’s Canvas site so you can check things off, mark what you’re working on, and jump straight to each assignment.

You do **not** need to know how to code. Follow the steps below from start to finish.

## Which browsers it works in

| Browser | Works? |
| --- | --- |
| **Google Chrome** | Yes |
| **Microsoft Edge** | Yes |
| Safari | No |
| Firefox | No |
| Phone or tablet browsers | No |

Install it in the **same Chrome or Edge window** you use for Canvas.

---

## How to set it up (first time)

### 1. Download the project from GitHub

If someone sent you a GitHub link, open it in Chrome or Edge.

1. On the GitHub page, click the green **Code** button.
2. Click **Download ZIP**.
3. Find the downloaded file (usually in your **Downloads** folder) and unzip it:
   - **Windows:** right-click the ZIP file → **Extract All** → **Extract**.
   - **Mac:** double-click the ZIP file.

You should now have a folder. Inside it you should see files such as `manifest.json`, `popup.html`, and `popup.js`. If you see one extra folder nested inside another, keep going until you find that set of files. **That** is the folder you will load in the next steps. Do not pick a parent folder that only contains another folder.

Keep this folder somewhere permanent, like **Documents**. Do not leave it in Downloads and then delete it later — the extension needs those files to stay on your computer.

### 2. Turn on developer extensions in your browser

This is a one-time switch. It is safe for this project. Your browser may show a warning that you are using “developer mode.” That is expected.

**In Chrome**

1. Open Chrome.
2. In the address bar at the top, type `chrome://extensions` and press Enter.
3. In the top-right corner, turn **Developer mode** on.

**In Edge**

1. Open Edge.
2. In the address bar at the top, type `edge://extensions` and press Enter.
3. On the left side, turn **Developer mode** on.

### 3. Load the to-do list into the browser

Still on the extensions page:

1. Click **Load unpacked**.
2. Select the folder you unzipped in step 1 (the one that contains `manifest.json`).
3. Click **Select Folder** (Windows) or **Open** (Mac).

You should now see **Canvas To-Do** in your list of extensions.

### 4. Pin it so you can find it

1. Click the puzzle-piece **Extensions** icon near the top-right of the browser (Chrome and Edge both have this).
2. Find **Canvas To-Do** and click the pin icon so it stays visible on the toolbar.

### 5. Sign in to Canvas, then open the list

1. Open your school’s Canvas site in that same browser and **sign in**.
2. Click the **Canvas To-Do** icon on the toolbar.
3. A panel opens on the right and loads your graded assignments.

If nothing shows up, click **Refresh**. If you see a message about not being logged in, go back to Canvas, make sure you are signed in, then click **Refresh** again.

You only need to do the download and “Load unpacked” steps once. After that, clicking the toolbar icon is all it takes.

---

## How to use it day to day

1. Sign in to Canvas in Chrome or Edge.
2. Click the **Canvas To-Do** icon. A panel opens on the right.
3. Your graded assignments appear, soonest due date first.

From there you can:

- **Open an assignment** — click its title. It opens in a new tab.
- **Mark it done** — check the box. (Submitted Canvas work is marked done for you.)
- **Mark it in progress** — click the circle next to the checkbox.
- **Mark it as needs review** — click the square next to the circle.
- **Filter by class** — use the **All classes** dropdown.
- **Hide finished work** — turn on **Hide done**.
- **Add a custom assignment** — expand **Add custom assignment**, then enter a title, link, class, and due date. Custom items stay on this computer and can be removed with the × on the row.
- **Refresh the list** — click **Refresh**, or just click back into the panel. It also updates on its own after you submit something in Canvas. Custom assignments stay in the list when you refresh.

If your school’s Canvas address is not the one shown at the top of the panel, click **Change school URL**, paste your Canvas link, and click **Save**.

---

## Good to know

- **Stay logged in to Canvas.** This tool uses the Canvas session already open in your browser. It does not ask for your password and cannot load assignments if you are logged out.
- **Use the same browser.** If you log into Canvas in Chrome, open Canvas To-Do in Chrome. Logging in on your phone, in Safari, or in a different browser does not count.
- **Open Canvas first if the list is empty.** If you see “Not logged in,” open Canvas, sign in, then click **Refresh**.
- **It only shows graded work.** Practice quizzes, surveys, and ungraded items are left out on purpose so the list stays focused on what counts in the gradebook.
- **Submitted work checks itself off.** After you turn something in on Canvas, it should move to done. You cannot uncheck those. Assignments you check off yourself (without submitting) stay checked on this computer.
- **Your checkmarks live in this browser.** Done / in progress / needs review are saved on this computer in this browser. They do not sync to your phone or to another computer.
- **Custom assignments are local.** Anything you add yourself (title, link, class, due date) is stored in this browser only. It is not created in Canvas.
- **Do not delete the project folder.** The extension reads files from the folder you loaded. If you move or delete that folder, go back to the extensions page, click **Load unpacked**, and select the folder again.
- **Leave Developer mode on.** You need it for this kind of extension. The browser warning is normal.
- **This is a computer extension, not a phone app.** It works in Chrome and Edge on a laptop or desktop, not in the Canvas mobile app.
