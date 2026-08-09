/**
 * Renders a JSON-LD block.
 *
 * A Server Component, so the markup is present in the initial HTML: crawlers
 * that do not execute JavaScript -- which includes several AI crawlers -- only
 * ever see the server response, so structured data injected on the client is
 * invisible to exactly the audience it is meant for.
 *
 * `dangerouslySetInnerHTML` is the standard way to emit this, and the escaping
 * below is what makes it safe for any input. JSON.stringify does not escape
 * `<`, so a string containing `</script>` would otherwise close the block early
 * and let the rest render as markup. Today every caller passes static site
 * constants, but this component is the obvious one to reuse for per-restaurant
 * structured data, where the name and address are tenant-supplied -- so it
 * escapes rather than relying on callers to stay careful.
 *
 * `<` is still a valid JSON escape for `<`, so consumers parse it
 * identically; only the HTML parser is affected.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
