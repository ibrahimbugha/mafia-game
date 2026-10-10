# Mafia (المافيا): Multiplayer Server

A noir Mafia game for **phones and laptops**. The server keeps the roles secret and runs the rules. Friends join with a 4-letter room code.

## 1. What you need

- A computer (Windows, Mac or Linux) with **Node.js 18 or newer**. Download the "LTS" version from nodejs.org.
- This folder, with exactly this structure (do not rename or move files):

```
mafia-server/
  server.js
  package.json
  public/
    index.html
    manifest.json
    icon-192.png
    icon-512.png
```

Check Node is installed: open a terminal and type `node -v`. You should see a version like `v20.x.x`.

## 2. Run the server (first time)

1. Open a terminal **inside the mafia-server folder**.
   - Windows: open the folder in File Explorer, click the address bar, type `cmd`, press Enter.
   - Mac: right-click the folder → "New Terminal at Folder".
   - Linux: right-click → "Open in Terminal".
2. Install the one dependency (only needed once):
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. You should see `Mafia server on port 3000`. Leave this window open. Closing it stops the game.
5. Stop the server any time with **Ctrl + C**.

If port 3000 is busy, use another one:
- Mac/Linux: `PORT=3001 npm start`
- Windows (cmd): `set PORT=3001&& npm start`
- Windows (PowerShell): `$env:PORT=3001; npm start`

## 3. Test it alone (on one laptop)

Normally 5 players are needed. For testing, lower the minimum to 3:

- Mac/Linux: `MIN_PLAYERS=3 npm start`
- Windows (cmd): `set MIN_PLAYERS=3&& npm start`
- Windows (PowerShell): `$env:MIN_PLAYERS=3; npm start`

Then:

1. Open `http://localhost:3000` in your browser. Tap **Play → Multiplayer**.
2. Type a name and tap **Create Room**. You get a code like `KQMD`.
3. Open **two more browser windows** at the same address. Use a private/incognito window or a different browser. Each tab/window is a separate player. Enter a different name and the code, then tap **Join**.
4. In the first window (the host), tap **Start**. Go through reveal, night, day and vote in each window.

Tip: use a private window or a different browser for each test player. The game remembers a player per browser, so closing and reopening the app brings you back to your room.

## 4. Test with real phones (same Wi-Fi)

1. Find the laptop's local address:
   - Windows: type `ipconfig`, look for "IPv4 Address" (for example `192.168.1.20`).
   - Mac: System Settings → Wi-Fi → Details, or type `ipconfig getifaddr en0` in a terminal.
   - Linux: type `hostname -I`.
2. On each phone (connected to the **same Wi-Fi**), open `http://192.168.1.20:3000` (use your own address).
3. Create a room on one phone, join with the others.

If phones cannot connect:
- Allow Node.js through the laptop firewall when Windows/Mac asks.
- Some Wi-Fi networks (public or guest networks) block devices from seeing each other. Try your phone's hotspot instead.
- Make sure the address starts with `http://` and has `:3000` at the end.

Note: on `http://` addresses, the "keep screen on" feature does not work (it needs HTTPS). Fullscreen and everything else works.

## 5. How to play

1. **Host:** Play → Multiplayer → enter your name → Create Room. Share the 4-letter code.
2. **Friends:** open the same link → Play → Multiplayer → name + code → Join.
3. **Host sets up the game** in the lobby: Classic or Custom roles, the number of each role, discussion time, and whether dead players' roles are shown. Killer, Silencer and Doctor are mandatory. Citizens fill the empty seats. Tap **Start** (minimum 5 players).
4. **Reveal:** everyone sees their role (mafia also see each other) and taps Ready.
5. **Night:** everyone picks a target on their own phone at the same time. Players with no ability get a decoy screen so nobody knows who is a citizen. The night ends early when everyone is done.
6. **Dawn:** the game announces who died and who is silenced.
7. **Day:** discuss in the in-game chat (and on a voice call outside the game if you like). Silenced players cannot type. The host can mute anyone. Dead players chat in their own channel. Tap "Ready to vote" when you are done.
8. **Vote:** each player votes in secret. The Mayor can use the triple vote once. Ties mean nobody is executed.
9. Repeat until one side wins.

**Winning:** the good side wins when **all mafia are caught**. The mafia win as soon as they **equal or outnumber** the good players. If both sides are wiped out together (for example the Spoiled Son takes the last mafia with him) the game is a **draw**. The Jester wins alone if the town votes him out.

If a phone loses connection or you close the app, open the game again: it rejoins your room automatically, or tap **"العودة إلى غرفتك"** on the menu. If the host disappears for 30 seconds, host powers pass to the next connected player.

## 6. Use it like a mobile game

- On a phone, open the link in Chrome or Safari and use **Add to Home Screen** for a full-screen app look.
- The ⛶ button (top corner) toggles fullscreen. The 🔊 button mutes sound.
- On a laptop, the layout widens to two columns, and **Enter** continues on screens with a main button.

## 7. Put it online (Render)

1. Put these files at the **top level** of your GitHub repository (`server.js` and `package.json` next to the `public` folder, not inside another folder).
2. On Render: New → **Web Service** → pick the repository. Build Command `npm install`, Start Command `node server.js`, instance type Free.
3. Wait for "Live", then open `https://YOUR-APP.onrender.com/health`. You should see `{"ok":true,"rooms":0}`.
4. A free service sleeps when idle, so the first load can take about a minute. Rooms live in memory and are lost on a restart.
5. To test with fewer than 5 players, add the environment variable `MIN_PLAYERS=3` on Render, and remove it afterwards.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "Room not found" | The code is wrong, or the server restarted (rooms live in memory) |
| "Minimum 5 players" | Add players, or start the server with `MIN_PLAYERS=3` for testing |
| No sound | Tap anywhere once first; phones block sound until you touch the screen |
| Page won't load on a phone | Same Wi-Fi? Firewall allowed? Correct `http://IP:3000`? |
| Menu loads but cannot create or join a room | Open `/test.html` on the same link (for example `https://your-app.onrender.com/test.html`) and press Run test. It shows which step fails. The game page must be opened from the Node server link, not from GitHub Pages or a Render Static Site |
| Window shows the old version | Hard refresh (Ctrl + Shift + R) |

## 9. Separate page and server (GitHub Pages, Play Store app)

By default the page connects to the address it was loaded from. If the page is hosted somewhere else, create `public/mp-config.js` next to `index.html` with:

```
window.MP = true;
window.MP_SERVER = "wss://YOUR-APP.onrender.com";
```

(On the Node server itself this file is not needed. The server generates it.)

## 10. Admin page (close rooms, announcements)

The admin page is `public/panel-595c93.html`. Players cannot open it: it needs a password, and the page name is not linked anywhere.

- The password is **not stored in the code**. Only a one-way scrypt hash is (the `ADMIN_HASH` line in `server.js`), so it is safe even in a public GitHub repo.
- Open `https://YOUR-APP.onrender.com/panel-595c93.html` and type the password. You can see every room, close one room, close all rooms, or send an announcement to every player.
- 5 wrong passwords from one place lock it out for 15 minutes.
- **Change the password:** run `node make-admin-hash.js "your new long password"`, then paste the printed line into `server.js` in place of the old `ADMIN_HASH` line.
- **Optional:** set an `ADMIN_KEY` environment variable (8+ characters) on Render. When set, it replaces the built-in password.
- To stop the **whole** server use Render's dashboard (Suspend). This page closes game rooms, not the Render service.
- To rename the page, rename the file. The password still protects it.

## 11. Kicking players (host)

The host sees a 🚪 button next to each player (in the lobby and during the day discussion).
- In the lobby the player is removed and cannot rejoin that room with the same name.
- During a game the player is removed from the game (counted as out), cannot rejoin, and the game continues without waiting for them.
- A kicked person can still open a different room or pick another name. There is no IP ban (shared phone networks would block innocent people).

## 12. What changed in this version

- **Win rule:** mafia win when they equal or outnumber the good. Both sides wiped out together = draw.
- **Silencer promotion:** when no Killer is alive, the Silencer silences one player **and** kills one player in the same night.
- **Discussion status bar:** a bar at the top shows every living player. The silenced player is highlighted.
- **Dead chat:** dead players read the main chat and talk to each other in a separate "dead chat" the living cannot see.
- **Creator credit** on the menu, the room lobby and the game-over screen, plus a small watermark during play.
- **Rejoin:** the session token is kept in `localStorage`. Closing the app and reopening it returns you to your room. If the same account opens in a second tab, the first tab is told it was replaced.
- **Host migration:** 30 seconds after the host disconnects, the next connected player becomes host. Everyone sees a message.
- **Voting transparency:** after each vote, the screen shows who voted for whom (the Mayor's triple vote shows as x3).
- **Game-over timeline:** a scrollable log of every night's hidden actions and every vote (for example "Night 1: Killer (X) targeted Y, Doctor (Z) saved Y").
- **PWA:** `manifest.json` + `sw.js` let players install the game to the home screen. Pass-and-play also opens offline.
- Kick and admin features from before are unchanged.

## 12. Android app (later)

The game is already an installable web app (manifest, icons, service worker, HTTPS on Render), so players can use **Add to Home Screen** today.
To make a real Android app, a Trusted Web Activity (made with PWABuilder or Bubblewrap) can wrap the Render link. Android verifies the link through a file you place at `public/.well-known/assetlinks.json` (the server already serves it as JSON).
Publishing on Google Play needs a Play developer account. Check Google's current list of supported registration locations first, and note that new personal accounts must run a closed test with 12 testers for 14 days before they can publish.
