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
  bummspitze: { id: 'bummspitze', out: 10, cost: { schrotterz: 1, glutbrocken: 1 } },
};
export const RECIPE_ORDER = Object.keys(RECIPES);
