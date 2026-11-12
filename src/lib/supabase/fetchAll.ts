// Supabase / PostgREST caps a single response at the project's max-rows (1000 by
// default). Any query that feeds a SUM/COUNT or a full export must page past that
// cap, or it silently undercounts once a table exceeds 1000 rows (a 2+ kid family
// hits this within one school year on daily_log/attendance). Build the query WITHOUT
// a range and pass a factory that applies .range() per page:
//
//   const logs = await fetchAllRows<DailyLog>((from, to) =>
//     supabase.from('daily_log').select('...').order('log_date').range(from, to))
//
// Pages in 1000-row batches until a short page signals the end. Throws on error so
// callers fail loud rather than reporting wrong totals.
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
