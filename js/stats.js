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
    // Бэкап: только онлайн-статистика (игры против человека), без соло
    async exportAll() {
      const list = await backend.list('stats');
      return {
        app: 'igroteka', v: 1, exported: new Date().toISOString(),
        players: list.map(s => ({ uid: s.id, name: s.name || '', photo: s.photo || '', wins: s.wins || {},
          totalWins: s.totalWins || 0, games: s.games || {}, recent: s.recent || [] })),
      };
    },
    validateBackup(o) {
      if (!o || o.app !== 'igroteka' || !Array.isArray(o.players)) throw new Error('Это не файл бэкапа Игротеки');
      const num = x => (Number.isInteger(x) && x >= 0 ? x : 0);
      const cleanGames = g => {
        const out = {};
        for (const [k, v] of Object.entries(g || {})) if (/^[A-Za-z]+$/.test(k) && v && typeof v === 'object') out[k] = { w: num(v.w), l: num(v.l), d: num(v.d) };
        return out;
      };
      return o.players.filter(p => p && typeof p.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(p.uid)).map(p => {
        const games = cleanGames(p.games), wins = {};
        let total = 0;
        for (const [k, v] of Object.entries(games)) { wins[k] = v.w; total += v.w; }
        return { uid: p.uid, name: String(p.name || 'Игрок').slice(0, 40), photo: /^https:\/\//.test(p.photo || '') ? p.photo : '',
          games, wins, totalWins: total, recent: Array.isArray(p.recent) ? p.recent.filter(x => typeof x === 'string').slice(0, 20) : [] };
      });
    },
    // Восстановление (только админ): онлайн-часть перезаписывается, соло-результаты сохраняются как есть
    async restore(players) {
      let done = 0;
      for (const p of players) {
        await backend.tx('stats/' + p.uid, cur => ({ name: p.name, photo: p.photo, wins: p.wins, totalWins: p.totalWins,
          games: p.games, recent: p.recent, solo: (cur && cur.solo) || {}, updatedAt: SERVER_TIME }));
        done++;
      }
      return done;
    },
    async isAdmin(u) { try { return !!(await backend.get('admins/' + u.uid)); } catch (e) { return false; } },
    top(field, n = 20) { return backend.top('stats', field, n); },
  };
}
