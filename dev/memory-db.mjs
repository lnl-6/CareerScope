// 本地内存版链式 DB，仅用于 Node 端冒烟测试（与平台后端 API 形状对齐）。
export function createMemoryDb(seed = {}) {
  const tables = new Map();
  for (const [name, rows] of Object.entries(seed)) tables.set(name, rows.map((row) => ({ ...row })));

  function table(name) {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  }

  function matches(row, filters) {
    return filters.every(([key, value]) => row[key] === value);
  }

  function builder(name, state = {}) {
    const filters = state.filters || [];
    const api = {
      select() { return api; },
      eq(key, value) { filters.push([key, value]); return api; },
      order(key, { ascending = true } = {}) {
        state.order = { key, ascending };
        return api;
      },
      limit(count) {
        state.limit = count;
        return api;
      },
      range(from, to) {
        state.range = [from, to];
        return api;
      },
      then(resolve, reject) {
        try {
          let rows = table(name).filter((row) => matches(row, filters));
          if (state.order) {
            const { key, ascending } = state.order;
            rows = rows.slice().sort((a, b) => {
              const left = a[key];
              const right = b[key];
              if (left === right) return 0;
              return (left < right ? -1 : 1) * (ascending ? 1 : -1);
            });
          }
          if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
          if (state.limit) rows = rows.slice(0, state.limit);
          resolve({ data: rows.map((row) => ({ ...row })), error: null });
        } catch (error) {
          reject(error);
        }
      },
    };
    return api;
  }

  return {
    tables,
    from(name) {
      return {
        select() {
          const api = builder(name);
          api.select();
          return api;
        },
        insert(row) {
          const rows = table(name);
          if (rows.some((item) => item.id === row.id)) {
            return Promise.resolve({ data: null, error: { code: 'unique_violation' } });
          }
          rows.push({ ...row });
          const result = builder(name);
          result.__inserted = true;
          const then = result.then.bind(result);
          result.then = (resolve, reject) => then(() => resolve({ data: [row], error: null }), reject);
          return result;
        },
        insertIfAbsent(row, { onConflict } = {}) {
          const rows = table(name);
          const keys = String(onConflict || 'id').split(',').map((key) => key.trim());
          const exists = rows.some((item) => keys.every((key) => item[key] === row[key]));
          if (!exists) rows.push({ ...row });
          const result = builder(name);
          result.then = (resolve, reject) => Promise.resolve({ data: exists ? [] : [row], error: null }).then(resolve, reject);
          return result;
        },
        update(patch) {
          const filters = [];
          let updatedCount = 0;
          const api = {
            eq(key, value) { filters.push([key, value]); return api; },
            select() { return api; },
            then(resolve, reject) {
              try {
                const rows = table(name);
                const updated = [];
                for (const row of rows) {
                  if (matches(row, filters)) {
                    Object.assign(row, patch);
                    updated.push({ ...row });
                  }
                }
                updatedCount = updated.length;
                resolve({ data: updated, error: null });
              } catch (error) {
                reject(error);
              }
            },
          };
          return api;
        },
        delete() {
          const filters = [];
          const api = {
            eq(key, value) { filters.push([key, value]); return api; },
            select() { return api; },
            then(resolve, reject) {
              try {
                const rows = table(name);
                for (let index = rows.length - 1; index >= 0; index -= 1) {
                  if (matches(rows[index], filters)) rows.splice(index, 1);
                }
                resolve({ data: [], error: null });
              } catch (error) {
                reject(error);
              }
            },
          };
          return api;
        },
      };
    },
  };
}
