// Статистика игроков: stats/{uid}. Из неё строится таблица лидеров.
export function createStats(backend, SERVER_TIME) {
  const blank = u => ({ name: u.name, photo: u.photo || '', wins: {}, totalWins: 0, games: {}, solo: {}, recent: [], updatedAt: SERVER_TIME });
  const fix = (s, u) => {
    s = s || blank(u);
    s.wins = s.wins || {}; s.games = s.games || {}; s.solo = s.solo || {}; s.recent = s.recent || [];
    s.totalWins = s.totalWins || 0;
    s.name = u.name; s.photo = u.photo || ''; s.updatedAt = SERVER_TIME;
    return s;
  };
  return {
    // res: 'w' | 'l' | 'd'. gid защищает от двойного учёта одной партии.
    recordOnline(u, game, gid, res) {
      return backend.tx('stats/' + u.uid, cur => {
        if (cur && (cur.recent || []).includes(gid)) return undefined;
        const s = fix(cur, u);
        const g = s.games[game] || { w: 0, l: 0, d: 0 };
        g[res] = (g[res] || 0) + 1; s.games[game] = g;
        if (res === 'w') { s.wins[game] = (s.wins[game] || 0) + 1; s.totalWins++; }
        s.recent = [gid, ...s.recent].slice(0, 20);
        return s;
      });
    },
    recordSolo(u, game, diff, res) {
      return backend.tx('stats/' + u.uid, cur => {
        const s = fix(cur, u);
        const g = s.solo[game] || {};
        const d = g[diff] || { w: 0, l: 0, d: 0 };
        d[res] = (d[res] || 0) + 1; g[diff] = d; s.solo[game] = g;
        return s;
      });
    },
    mine(u) { return backend.get('stats/' + u.uid); },
    top(field, n = 20) { return backend.top('stats', field, n); },
  };
}
