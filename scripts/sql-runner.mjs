/**
 * Runs the raw-SQL files against Postgres without psql.
 *
 * psql is not on a managed app host, and requiring it put the one command that
 * establishes tenant isolation out of reach on exactly the platforms most
 * likely to need it. This does the two things psql was being used for —
 * variable substitution and running a multi-statement script — and nothing
 * else.
 *
 * Substitution deliberately matches psql's rules, so the same .sql file runs
 * either way:
 *
 *   :'name'   a quoted string literal
 *   :"name"   a quoted identifier
 *
 * and, as in psql, neither reaches inside a string or a dollar-quoted body.
 * That last part is not a nicety: rls.sql has function bodies containing `::`
 * casts and `'%'` patterns, and a careless regex over the whole file would
 * eventually rewrite the inside of one.
 */

/** A string literal, escaped the way Postgres reads it. */
export function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** An identifier, quoted so it cannot be anything but a name. */
export function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * psql meta-commands that only guard or announce. They have no effect on what
 * the database is asked to do, so they are dropped. Anything else starting with
 * a backslash changes the meaning of the script and is refused rather than
 * ignored.
 */
const DROPPABLE_META = /^\s*\\(if|elif|else|endif|echo|qecho|quit|set|unset|timing|pset)\b/;
const ANY_META = /^\s*\\/;

/**
 * Walks the script, substituting only in the parts psql would, and stripping
 * the meta-command lines.
 *
 * @param {string} sql   file contents
 * @param {Record<string, string>} vars
 * @returns {string}
 */
export function prepareScript(sql, vars) {
  let out = "";
  let i = 0;
  let atLineStart = true;

  const take = (n) => { out += sql.slice(i, i + n); i += n; };

  while (i < sql.length) {
    const rest = sql.slice(i);

    // A psql meta-command occupies a whole line.
    if (atLineStart && ANY_META.test(rest.split("\n", 1)[0])) {
      const line = rest.split("\n", 1)[0];
      if (!DROPPABLE_META.test(line)) {
        throw new Error(
          `Unsupported psql meta-command: ${line.trim()}\n` +
            "It changes what the script does, so it cannot simply be skipped.",
        );
      }
      // The newline goes with it, so stripping a guard block leaves no gap.
      i += line.length + (sql[i + line.length] === "\n" ? 1 : 0);
      continue;
    }
    atLineStart = false;

    // Line comment.
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      take(end === -1 ? sql.length - i : end - i);
      continue;
    }

    // Block comment. Postgres nests these.
    if (rest.startsWith("/*")) {
      let depth = 0;
      const start = i;
      while (i < sql.length) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; if (depth === 0) break; }
        else i++;
      }
      out += sql.slice(start, i);
      continue;
    }

    // Single-quoted string. '' is an escaped quote, not the end.
    if (rest.startsWith("'")) {
      const start = i;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i++; break; }
        else i++;
      }
      out += sql.slice(start, i);
      continue;
    }

    // Quoted identifier.
    if (rest.startsWith('"')) {
      const start = i;
      i++;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') { i++; break; }
        else i++;
      }
      out += sql.slice(start, i);
      continue;
    }

    // Dollar-quoted body. Ends only at the identical tag, so a $p$ inside a $$
    // block is content rather than a delimiter.
    const open = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (open) {
      const tag = open[0];
      const close = sql.indexOf(tag, i + tag.length);
      if (close === -1) {
        throw new Error(`Unterminated dollar-quoted string opened with ${tag}`);
      }
      const end = close + tag.length;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // :'name' — a string literal.
    const lit = /^:'([A-Za-z_][A-Za-z0-9_]*)'/.exec(rest);
    if (lit) {
      if (!(lit[1] in vars)) throw new Error(`No value supplied for :'${lit[1]}'`);
      out += quoteLiteral(vars[lit[1]]);
      i += lit[0].length;
      continue;
    }

    // :"name" — an identifier.
    const ident = /^:"([A-Za-z_][A-Za-z0-9_]*)"/.exec(rest);
    if (ident) {
      if (!(ident[1] in vars)) throw new Error(`No value supplied for :"${ident[1]}"`);
      out += quoteIdentifier(vars[ident[1]]);
      i += ident[0].length;
      continue;
    }

    if (sql[i] === "\n") atLineStart = true;
    take(1);
  }

  return out;
}
