export type LocationType = "city_all" | "city" | "station";

export type Location = {
  id: string;
  /** Valor enviado na busca de viagens (cidade canônica). */
  city: string;
  state: string;
  /** Nome exibido (cidade, "TODOS" ou terminal). */
  name: string;
  type: LocationType;
};

/**
 * Base mínima local — sem API pública confiável de rodoviárias no BR.
 * Inclui cidades do seed (Aracaju/Salvador) + capitais/terminais comuns p/ UX.
 * Depois dá pra trocar por IBGE (municípios) + catálogo próprio de terminais.
 */
export const LOCATIONS: Location[] = [
  // SE — Aracaju (seed)
  {
    id: "aju-all",
    city: "Aracaju",
    state: "SE",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "aju-city",
    city: "Aracaju",
    state: "SE",
    name: "Aracaju",
    type: "city",
  },
  {
    id: "aju-terminal",
    city: "Aracaju",
    state: "SE",
    name: "Terminal Rodoviário de Aracaju",
    type: "station",
  },
  {
    id: "aju-petrox",
    city: "Aracaju",
    state: "SE",
    name: "Posto Petrox",
    type: "station",
  },

  // BA — Salvador (seed)
  {
    id: "ssa-all",
    city: "Salvador",
    state: "BA",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "ssa-city",
    city: "Salvador",
    state: "BA",
    name: "Salvador",
    type: "city",
  },
  {
    id: "ssa-terminal",
    city: "Salvador",
    state: "BA",
    name: "Terminal Rodoviário de Salvador",
    type: "station",
  },

  // SP
  {
    id: "sp-all",
    city: "São Paulo",
    state: "SP",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "sp-city",
    city: "São Paulo",
    state: "SP",
    name: "São Paulo",
    type: "city",
  },
  {
    id: "sp-tiete",
    city: "São Paulo",
    state: "SP",
    name: "Terminal Rodoviário do Tietê",
    type: "station",
  },
  {
    id: "sp-barra",
    city: "São Paulo",
    state: "SP",
    name: "Terminal Barra Funda",
    type: "station",
  },

  // RJ
  {
    id: "rj-all",
    city: "Rio de Janeiro",
    state: "RJ",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "rj-city",
    city: "Rio de Janeiro",
    state: "RJ",
    name: "Rio de Janeiro",
    type: "city",
  },
  {
    id: "rj-novo-rio",
    city: "Rio de Janeiro",
    state: "RJ",
    name: "Terminal Novo Rio",
    type: "station",
  },

  // MG
  {
    id: "bh-all",
    city: "Belo Horizonte",
    state: "MG",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "bh-city",
    city: "Belo Horizonte",
    state: "MG",
    name: "Belo Horizonte",
    type: "city",
  },
  {
    id: "bh-terminal",
    city: "Belo Horizonte",
    state: "MG",
    name: "Terminal Rodoviário de Belo Horizonte",
    type: "station",
  },

  // PE
  {
    id: "rec-all",
    city: "Recife",
    state: "PE",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "rec-city",
    city: "Recife",
    state: "PE",
    name: "Recife",
    type: "city",
  },
  {
    id: "rec-terminal",
    city: "Recife",
    state: "PE",
    name: "Terminal Rodoviário de Recife",
    type: "station",
  },

  // DF
  {
    id: "bsb-all",
    city: "Brasília",
    state: "DF",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "bsb-city",
    city: "Brasília",
    state: "DF",
    name: "Brasília",
    type: "city",
  },
  {
    id: "bsb-terminal",
    city: "Brasília",
    state: "DF",
    name: "Rodoviária Interestadual de Brasília",
    type: "station",
  },

  // CE
  {
    id: "for-all",
    city: "Fortaleza",
    state: "CE",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "for-city",
    city: "Fortaleza",
    state: "CE",
    name: "Fortaleza",
    type: "city",
  },
  {
    id: "for-terminal",
    city: "Fortaleza",
    state: "CE",
    name: "Terminal Rodoviário de Fortaleza",
    type: "station",
  },

  // PR
  {
    id: "cwb-all",
    city: "Curitiba",
    state: "PR",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "cwb-city",
    city: "Curitiba",
    state: "PR",
    name: "Curitiba",
    type: "city",
  },
  {
    id: "cwb-terminal",
    city: "Curitiba",
    state: "PR",
    name: "Terminal Rodoviário de Curitiba",
    type: "station",
  },

  // RS
  {
    id: "poa-all",
    city: "Porto Alegre",
    state: "RS",
    name: "TODOS",
    type: "city_all",
  },
  {
    id: "poa-city",
    city: "Porto Alegre",
    state: "RS",
    name: "Porto Alegre",
    type: "city",
  },
  {
    id: "poa-terminal",
    city: "Porto Alegre",
    state: "RS",
    name: "Terminal Rodoviário de Porto Alegre",
    type: "station",
  },

  // BA — Feira / BA inland
  {
    id: "fsa-city",
    city: "Feira de Santana",
    state: "BA",
    name: "Feira de Santana",
    type: "city",
  },
  {
    id: "fsa-terminal",
    city: "Feira de Santana",
    state: "BA",
    name: "Terminal Rodoviário de Feira de Santana",
    type: "station",
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function formatLocationLabel(location: Location) {
  if (location.type === "city_all") {
    return `${location.city}, ${location.state} - TODOS`;
  }
  if (location.type === "city") {
    return `${location.city}, ${location.state}`;
  }
  return `${location.city}, ${location.state} - ${location.name}`;
}

export function searchLocations(query: string, limit = 8): Location[] {
  const q = normalize(query);
  if (!q) {
    // Destaque cidades do lab + capitais
    const featured = [
      "aju-all",
      "ssa-all",
      "sp-all",
      "rj-all",
      "bh-all",
      "rec-all",
    ];
    return featured
      .map((id) => LOCATIONS.find((l) => l.id === id))
      .filter((l): l is Location => Boolean(l));
  }

  return LOCATIONS.filter((location) => {
    const haystack = normalize(
      `${location.city} ${location.state} ${location.name}`,
    );
    return haystack.includes(q);
  }).slice(0, limit);
}

export function resolveCityValue(input: string): string {
  const q = normalize(input);
  if (!q) return input.trim();

  const exact = LOCATIONS.find(
    (l) =>
      normalize(l.city) === q ||
      normalize(formatLocationLabel(l)) === q ||
      normalize(l.name) === q,
  );
  if (exact) return exact.city;

  const partial = searchLocations(input, 1)[0];
  return partial?.city ?? input.trim();
}
