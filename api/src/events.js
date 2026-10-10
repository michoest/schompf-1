/**
 * Live-Sync per Server-Sent Events: Jede erfolgreiche Änderung wird an alle offenen Geräte gemeldet
 * ({ scope, by, deviceId }); die Geräte laden daraufhin die betroffenen Daten neu.
 */
export function createEventHub() {
  const clients = new Set();

  function subscribe(req, res, auth) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ person: auth.person.name })}\n\n`);
    const client = { res, deviceId: auth.device.id };
    clients.add(client);
    // Kommentarzeile alle 25 s hält die Verbindung durch Proxy/Tunnel offen
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(client); });
  }

  function publish(event) {
    const data = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.res.write(data);
  }

  return { subscribe, publish, get size() { return clients.size; } };
}
