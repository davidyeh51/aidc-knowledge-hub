const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export const audiences = { personal: "自己", team: "團隊成員", owner: "資產擁有者", investor: "投資者" };

export function findDecks(decks, query = "", audience = "", kind = "") {
  const terms = query.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return decks.filter((d) => (!audience || d.audience.includes(audience)) && (!kind || d.kind === kind))
    .flatMap((deck) => {
      const meta = normalize([deck.title, deck.subtitle, deck.summary, deck.topic, ...deck.tags].join(" "));
      const full = meta + deck.slides.map((s) => normalize(s.text)).join(" ");
      if (!terms.every((term) => full.includes(term))) return [];
      const phrase = normalize(query);
      let matchPage = -1;
      let bestScore = 0;
      if (phrase) {
        for (const [index, slide] of deck.slides.entries()) {
          const text = normalize(slide.text);
          const matches = terms.filter((term) => text.includes(term)).length;
          const score = matches + (text.includes(phrase) ? terms.length : 0);
          if (score > bestScore) {
            bestScore = score;
            matchPage = index;
          }
        }
      }
      return [{ deck, matchPage }];
    });
}
