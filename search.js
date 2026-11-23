const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export const audiences = { personal: "自己", team: "團隊成員", owner: "資產擁有者", investor: "投資者" };

export function findDecks(decks, query = "", audience = "", kind = "") {
  const terms = query.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return decks.filter((d) => (!audience || d.audience.includes(audience)) && (!kind || d.kind === kind))
    .flatMap((deck) => {
      const meta = normalize([deck.title, deck.subtitle, deck.summary, deck.topic, ...deck.tags].join(" "));
      const full = meta + deck.slides.map((s) => normalize(s.text)).join(" ");
      if (!terms.every((term) => full.includes(term))) return [];
      const matchPage = terms.length ? deck.slides.findIndex((s) => {
        const text = normalize(s.text);
        return terms.some((term) => text.includes(term));
      }) : -1;
      return [{ deck, matchPage }];
    });
}
