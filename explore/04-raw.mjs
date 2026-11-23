// Talks to the page target directly, bypassing Playwright, to see if the tab is responsive or blocked by a dialog.
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
ws.onmessage = (m) => console.log(String(m.data).slice(0, 400));
ws.onopen = () => { send('Page.enable'); send('Runtime.evaluate', { expression: 'document.readyState + " | " + document.title + " | " + (document.querySelector("#records-count")||{}).innerText' }); };
setTimeout(() => { ws.close(); process.exit(0); }, 6000);
