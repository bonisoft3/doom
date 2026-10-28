// Fetches what the game needs before it can start: the graphics and sprite
// indices the renderer reads, and every level of the episode (the engine
// moves to the next level on its own, so all are registered up front).

import { registerEpisode, registerLevel } from "./level.js";

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`assets: ${url} answered ${res.status}`);
  return res.json();
}

export async function loadDoomAssets(basePath) {
  const [graphics, sprites] = await Promise.all([json(`${basePath}levels/index.json`), json(`${basePath}things/index.json`)]);
  registerEpisode(graphics);
  await Promise.all(graphics.levels.map(async ({ name }) => registerLevel(await json(`${basePath}levels/${name}.json`))));
  return { basePath, graphics, sprites };
}
