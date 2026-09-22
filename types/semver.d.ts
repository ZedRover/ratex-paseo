// `semver` ships no types and its deep function entry points are not covered by
// @types/semver's package exports; declare the two helpers the tests use.
declare module "semver/functions/parse.js" {
  const parse: (version: string) => { major: number; minor: number; patch: number } | null;
  export default parse;
}

declare module "semver/functions/satisfies.js" {
  const satisfies: (version: string, range: string) => boolean;
  export default satisfies;
}
