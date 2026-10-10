// Item recipes (GDD 7). `out` = pieces per craft. Sprudelwasser is gathered, not crafted.
export const RECIPES = {
  flickbrause: { id: 'flickbrause', out: 1, cost: { knisterkraut: 1, sprudelwasser: 1 } },
  dicke_flickbrause: { id: 'dicke_flickbrause', out: 1, cost: { flickbrause: 1, wabbelpilz: 1 } },
  pustekuchen: { id: 'pustekuchen', out: 1, cost: { blaublatt: 1, brummkaefer: 1 } },
  blendknolle: { id: 'blendknolle', out: 1, cost: { blitzkaefer: 1, stinkmorchel: 1 } },
  stinkbombe: { id: 'stinkbombe', out: 1, cost: { stinkmorchel: 2 } },
  klebefalle: { id: 'klebefalle', out: 1, cost: { wabbelpilz: 1, grossknochen: 1 } },
  knallgurke: { id: 'knallgurke', out: 1, cost: { glutbrocken: 1, altknochen: 1 } },
  brennspitze: { id: 'brennspitze', out: 10, cost: { glutbrocken: 1, altknochen: 1 } },
  giftspitze: { id: 'giftspitze', out: 10, cost: { stinkmorchel: 1, altknochen: 1 } },
  grillsteak: { id: 'grillsteak', out: 1, cost: { rohfleisch: 1, glutbrocken: 1 } }, // [L]
  bummspitze: { id: 'bummspitze', out: 10, cost: { schrotterz: 1, glutbrocken: 1 } },
  rostbombe: { id: 'rostbombe', out: 1, cost: { rostkaefer: 1, schlacke: 1 } }, // Rostwerke
  rostspitze: { id: 'rostspitze', out: 10, cost: { rostkaefer: 1, altknochen: 1 } },
  erdungsstab: { id: 'erdungsstab', out: 1, cost: { kupferdraht: 2, altknochen: 1 } },
  kuehlbrause: { id: 'kuehlbrause', out: 1, cost: { blaublatt: 1, sprudelwasser: 1, rostkaefer: 1 } },
};
export const RECIPE_ORDER = Object.keys(RECIPES);
