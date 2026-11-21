// A request-scoped memo for repository reads that more than one layer makes (for example the sales dataset, read by both L21 and L04). The report
// runner hands every layer a `Db` made by `requestScoped`, a thin wrapper that is new for each report; a read memoised on it lives and dies with
// that report. Layers still never call each other (AD-1): each calls the repo, and the repo remembers the answer for the request.
// A `Db` that was not made by `requestScoped` (a script, a test, a direct layer call) is never memoised, so nothing here can serve a stale answer
// across requests or across a dataset publish, even though the Worker keeps one Neon `Db` for the life of the isolate.
import type { Db } from "../db";

const memos = new WeakMap<Db, Map<string, Promise<unknown>>>();

/** A wrapper around `db` for the life of one report. Same queries, same results; only `memoPerRequest` treats it differently. */
export function requestScoped(db: Db): Db {
  const scoped: Db = {
    query: (text, params) => db.query(text, params),
    ...(db.transaction ? { transaction: (fn) => db.transaction!((tx) => fn(tx)) } : {}),
  };
  memos.set(scoped, new Map());
  return scoped;
}

/** Runs `load` once per request-scoped `db` and key; any other `db` just runs it. A failed load is forgotten so a later call can try again. */
export function memoPerRequest<T>(db: Db, key: string, load: () => Promise<T>): Promise<T> {
  const memo = memos.get(db);
  if (!memo) return load();
  const hit = memo.get(key);
  if (hit) return hit as Promise<T>;
  const p = load();
  memo.set(key, p);
  p.catch(() => {
    if (memo.get(key) === p) memo.delete(key);
  });
  return p;
}
