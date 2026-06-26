// Accept either a bare room code or a full invite/match URL and return the id.
export function extractMatchId(input) {
  const s = (input || '').trim();
  if (!s) return '';
  const m = s.match(/\/(?:join-match|match)\/([^/?#]+)/);
  if (m) return m[1];
  // strip any query/hash if someone pasted a partial; otherwise it's a bare code
  return s.split(/[?#]/)[0];
}
