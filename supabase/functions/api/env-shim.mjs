// Deno nema process.env: izlažemo varijable okruženja koje očekuje zajednički kod.
globalThis.process ??= { env: Deno.env.toObject() };
