# Setting up the Studio and a runner on office PCs

A runner is the program that works TP Catalyst in a Chrome window on one PC. The Studio (website and API) runs on
one PC; each runner PC connects out to it. Nothing connects in to a runner PC.

One runner per PC, and one TP Catalyst login per runner. Two runners must not share a TP Catalyst login session.

## What each PC needs

- Windows, Google Chrome, Node.js 22.9 or newer (`node --version`).
- The project folder. Copy everything except `chrome-profile`, `runs`, `studio\data`, `node_modules`, `local.env`
  and `office.env`. The planner keys in `local.env` stay on the Studio PC only; a runner never needs them.
- In the copied folder, once: `npm install`.

## Settings file

Copy `office.env.example` to `office.env` in the project folder and fill it in. Both start files read it.

| Line | Studio PC | Runner PC |
|---|---|---|
| `HOST` | `0.0.0.0` so other PCs can reach it | not needed |
| `STUDIO_PASSWORD` | the password the website asks for, 8 or more letters and digits (no `#`) | not needed |
| `RUNNER_TOKEN` | 24 characters or more | the same value |
| `STUDIO_URL` | leave as it is | the Studio PC's address, for example `http://192.168.1.20:3000` |
| `RUNNER_NAME` | a name if this PC also runs a runner | a name for this PC |
| `SHAREPOINT_DIR` | only if this PC also runs a runner | optional: the synced SharePoint folder (see below) |

The Studio refuses to start on the network unless both the token and the password are set.

## On the Studio PC

1. Double-click **Start Studio**. Leave the window open.
2. Allow incoming connections to port 3000 in Windows Firewall, private network only. This is a system setting:
   do it yourself or ask IT.
3. Open `http://<studio pc address>:3000` from another PC. The browser asks for a user name and password: any user
   name, and the Studio password.

## On each runner PC

1. Double-click **Start Runner**. A Chrome window opens: log in to TP Catalyst in it and leave it open.
2. Open the Studio website and check the Agents tab: the runner shows as online and idle.

## Saving exports to SharePoint (optional)

1. On the runner PC, open the SharePoint library in the browser and press **Sync**. OneDrive adds it as a folder
   in File Explorer, under the organisation's name.
2. Create or pick the folder the exports should go to, open it in File Explorer and copy its full path from the
   address bar.
3. Put that path in `office.env` as `SHAREPOINT_DIR=` (no quotes), then close and start the runner again.
4. After each export the Run page shows "Saved to SharePoint" with the file's path. If the folder is missing the
   page says so; the export itself still succeeds and the file can be downloaded from the Run page.

A file is never overwritten: a second export with the same name gets the date and time added. The copy uses the
Microsoft login already on that PC; the Studio holds no SharePoint password or key.

## Day to day

- TP Catalyst logs out after about an hour of no use. The runner then shows "logged out" and holds its work; log
  in again in the Chrome window and it carries on by itself.
- A search interrupted by a logout goes back to the queue and reruns from the start. An export interrupted after
  credits were spent is never rerun automatically: it shows as failed with the reason.
- Excel files are kept in `runs\<search>\` on the runner PC and in `studio\data\exports\` on the Studio PC.

## Known limits

- One shared password for everyone; there are no personal accounts yet. They come with the AWS stage.
- The password and token travel unencrypted (http) inside the office network. Keep the Studio on the private office
  network only, and change both if a PC is retired.
- With two runners, whichever is idle takes the next search; a task is never given to both.
